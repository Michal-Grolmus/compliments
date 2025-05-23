sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/resource/ResourceModel"
], function (UIComponent, JSONModel, ResourceModel) {
  "use strict";

  return UIComponent.extend("lichotky.app.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      const sLang = navigator.language || navigator.userLanguage;
      const isCzech = sLang && sLang.toLowerCase().startsWith("cs");

      const i18nModel = new ResourceModel({
        bundleUrl: isCzech
          ? "i18n/i18n_cs.properties"
          : "i18n/i18n.properties"
      });
      this.setModel(i18nModel, "i18n");

    }
  });
});
