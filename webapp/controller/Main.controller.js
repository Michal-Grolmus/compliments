sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/resource/ResourceModel"
], function (Controller, JSONModel, ResourceModel) {
    "use strict";

    return Controller.extend("lichotky.app.controller.Main", {

        /**
         * Called when the controller is initialized.
         * Loads and translates attribute categories and employees.
         * Sets up the necessary models for the view.
         */
        onInit: function () {
            const oView = this.getView();
            const oI18n = oView.getModel("i18n").getResourceBundle();
            document.title = oI18n.getText("appTitle");

            // Load and translate attribute categories from Attributes.json
            fetch("model/Attributes.json")
                .then(response => response.json())
                .then(rawData => {
                    // Translate category and attribute names using i18n
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
                    // Log error if attribute loading or translation fails
                    console.error("Error loading or translating attributes:", err);
                });

            // Load employees from Employees.json (no translation needed)
            const oEmployeeModel = new JSONModel("model/Employees.json");
            oView.setModel(oEmployeeModel);
        },

        /**
         * Handler for the main action button.
         * Validates input, collects selected attributes, and sends a request to generate a compliment.
         * Handles streaming response and displays the compliment in a modal dialog.
         */
        onGenerate: async function () {
            const oView = this.getView();
            const bundle = oView.getModel("i18n").getResourceBundle();

            const employeeName = oView.byId("employeeInput").getValue().trim();

            // Validate employee name
            if (!this._validateName(employeeName)) {
                sap.m.MessageToast.show(bundle.getText("invalidName"));
                return;
            }

            // Collect selected attributes from all panels
            const selectedAttributes = [];
            const aPanels = oView.byId("attributesContainer").getItems();

            // Determine language for compliment generation
            const language = (navigator.language || "en").startsWith("cs") ? "cs" : "en";

            aPanels.forEach(panel => {
                // Each panel contains a VBox with CheckBoxes
                const vbox = panel.getContent()[0];
                const checkboxes = vbox.getItems();
                checkboxes.forEach(oCheckBox => {
                    if (oCheckBox.getSelected()) {
                        selectedAttributes.push(oCheckBox.getText());
                    }
                });
            });

            // Show error if name or attributes are missing
            if (!employeeName) {
                sap.m.MessageToast.show(bundle.getText("missingName"));
                return;
            }
            if (selectedAttributes.length === 0) {
                sap.m.MessageToast.show(bundle.getText("missingSelection"));
                return;
            }

            try {
                // Open modal dialog with BusyIndicator
                this._showComplimentDialog();

                // Send request to backend API for compliment generation
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
                    throw new Error("Stream failed");
                }

                // Handle streaming response from backend
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

                    for (const line of lines) {
                        const text = line.replace("data: ", "");
                        if (!text) continue;

                        // On first token, replace BusyIndicator with FormattedText
                        if (!receivedFirstToken) {
                            receivedFirstToken = true;
                            oBox.removeAllContent();
                            oText = new sap.m.FormattedText({ htmlText: "" });
                            oBox.addContent(oText);
                        }

                        compliment += text;

                        if (oText) {
                            // Replace newlines with HTML line breaks for display
                            const formatted = compliment
                                .replace(/\n\n/g, "<br><br>")
                                .replace(/\n/g, "<br>");

                            oText.setHtmlText(formatted);
                        }
                    }
                }

            } catch (err) {
                // Handle errors in streaming or API call
                console.error("Stream failed", err);
                sap.m.MessageBox.error(bundle.getText("apiError") + (err.message ? ` (${err.message})` : ""));
            }
        },

        /**
         * Opens a modal dialog to display the compliment or a loading indicator.
         * Uses a ScrollContainer with a centered VBox for proper layout and scrolling.
         */
        _showComplimentDialog: function () {
            const bundle = this.getView().getModel("i18n").getResourceBundle();

            if (this._oDialog) {
                this._oDialog.destroy();
            }

            // Nested VBox for centering content (BusyIndicator or compliment text)
            const oVBox = new sap.m.VBox({
                alignItems: "Center",
                justifyContent: "Center",
                height: "100%",
                items: [
                    new sap.m.BusyIndicator({ size: "1.5rem", visible: true })
                ]
            });

            // ScrollContainer to allow scrolling if compliment is long
            const oContentBox = new sap.m.ScrollContainer({
                id: "complimentBox",
                vertical: true,
                height: "500px",
                horizontal: false,
                content: [oVBox]
            });

            // Modal dialog setup
            this._oDialog = new sap.m.Dialog({
                title: bundle.getText("dialogTitle"),
                contentWidth: "500px",
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

        /**
         * Validates the employee name input.
         * - Must be at least 2 characters.
         * - Only allows letters (including diacritics), dash, space, and apostrophe.
         * @param {string} name - The name to validate.
         * @returns {boolean} True if valid, false otherwise.
         */
        _validateName: function (name) {
            const trimmed = name.trim();

            // Empty or too short name
            if (trimmed.length < 2) return false;

            // Disallowed characters – only letters (with diacritics), dash, space, apostrophe
            if (!/^[A-ZÁČĎÉĚÍĽŇÓŘŠŤÚŮÝŽ][a-zA-Zá-žčďěňřšťžůúýÁČĎÉĚÍĽŇÓŘŠŤÚŮÝŽ\s\-']{1,}$/.test(trimmed)) {
                return false;
            }

            return true;
        }

    });
});
