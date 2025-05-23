sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/resource/ResourceModel",
    "lichotky/app/model/formatter"
], function (Controller, JSONModel, ResourceModel, formatter) {
    "use strict";

    return Controller.extend("lichotky.app.controller.Main", {
        formatter: formatter,

        onInit: function () {
            const oView = this.getView();
            const oI18n = oView.getModel("i18n").getResourceBundle();

            // Načti Attributes.json přes fetch + .then()
            fetch("model/Attributes.json")
                .then(response => response.json())
                .then(rawData => {
                    // Přelož kategorie a atributy
                    const translatedData = {
                        categories: rawData.categories.map(category => {
                            return {
                                name: oI18n.getText(category.name),
                                attributes: category.attributes.map(attrKey => oI18n.getText(attrKey))
                            };
                        })
                    };

                    const oAttributesModel = new JSONModel(translatedData);
                    oView.setModel(oAttributesModel, "attributes");
                })
                .catch(err => {
                    console.error("Chyba při načítání nebo překladu atributů:", err);
                });

            // Načti zaměstnance synchronně (není třeba překlad)
            const oEmployeeModel = new JSONModel("model/Employees.json");
            oView.setModel(oEmployeeModel);
        },


        onGenerate: async function () {
            const oView = this.getView();
            const bundle = oView.getModel("i18n").getResourceBundle();

            const employeeName = oView.byId("employeeInput").getValue().trim();

            const selectedAttributes = [];
            const aPanels = oView.byId("attributesContainer").getItems();

            const language = (navigator.language || "en").startsWith("cs") ? "cs" : "en";

            aPanels.forEach(panel => {
                const vbox = panel.getContent()[0]; // VBox s CheckBoxy
                const checkboxes = vbox.getItems();
                checkboxes.forEach(oCheckBox => {
                    if (oCheckBox.getSelected()) {
                        selectedAttributes.push(oCheckBox.getText());
                    }
                });
            });

            if (!employeeName) {
                sap.m.MessageToast.show(bundle.getText("missingName"));
                return;
            }
            if (selectedAttributes.length === 0) {
                sap.m.MessageToast.show(bundle.getText("missingSelection"));
                return;
            }

            try {
                this._showComplimentDialog();

                const response = await fetch("http://localhost:3000/api/generate-compliment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        employeeName,
                        attributes: selectedAttributes,
                        lang: language
                    })
                });

                if (!response.ok || !response.body) {
                    throw new Error("Stream selhal");
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");

                let compliment = "";
                const oBox = sap.ui.getCore().byId("complimentBox");
                let oText = null;
                let receivedFirstToken = false;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split("\n").filter(line => line.startsWith("data: "));
                    console.log("Chunk:", chunk); // Debugging line
                    console.log("Stringify:", JSON.stringify(chunk)); // Debugging line

                    for (const line of lines) {
                        const text = line.replace("data: ", "");
                        if (!text) continue;

                        if (!receivedFirstToken) {
                            receivedFirstToken = true;
                            oBox.removeAllItems();
                            oText = new sap.m.FormattedText({ htmlText: "" });
                            oBox.addItem(oText);
                        }


                        console.log("Text     :", text); // Debugging line
                        console.log("Stringify:", JSON.stringify(text)); // Debugging line

                        compliment += text;

                        if (oText) {
                            // Nahraď \n\n za <br><br> (odstavec), \n za <br>
                            const formatted = compliment
                                .replace(/\n\n/g, "<br><br>")
                                .replace(/\n/g, "<br>");

                            oText.setHtmlText(formatted);
                        }

                    }
                }

            } catch (err) {
                console.error("Stream failed", err);
                sap.m.MessageBox.error(bundle.getText("apiError") + (err.message ? ` (${err.message})` : ""));
            }
        },

        _showComplimentDialog: function () {
            const bundle = this.getView().getModel("i18n").getResourceBundle();

            if (this._oDialog) {
                this._oDialog.destroy();
            }

            const oContentBox = new sap.m.VBox("complimentBox", {
                alignItems: "Center",
                justifyContent: "Center",
                items: [
                    new sap.m.BusyIndicator({ size: "2rem", visible: true })
                ]
            });

            this._oDialog = new sap.m.Dialog({
                title: bundle.getText("dialogTitle"),
                contentWidth: "400px",
                content: [oContentBox],
                beginButton: new sap.m.Button({
                    text: bundle.getText("closeButton"),
                    press: () => this._oDialog.close()
                }),
                endButton: new sap.m.Button({
                    text: bundle.getText("regenerateButton"),
                    press: this.onGenerate.bind(this)
                }),
                afterClose: () => {
                    this._oDialog.destroy();
                    this._oDialog = null;
                }
            });

            this._oDialog.open();
        },

        getText(i18nKey) {

            const dialogue = this.getView().getModel("i18n").getProperty(i18nKey);

            return dialogue;

        }
    });
});
