sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/resource/ResourceModel"
], function (UIComponent, JSONModel, ResourceModel) {
  "use strict";

  /**
   * Root component for the lichotky.app UI5 application.
   * Handles application bootstrap, i18n model setup, and component-level configuration.
   */
  return UIComponent.extend("lichotky.app.Component", {
    metadata: {
      manifest: "json" // Loads configuration from manifest.json
    },

    /**
     * Component initialization lifecycle method.
     * - Calls base UIComponent init.
     * - Detects browser language and loads the appropriate i18n resource bundle (Czech or default).
     * - Sets the i18n model for use throughout the app.
     */
    init: function () {
      // Call the base component's init function
      UIComponent.prototype.init.apply(this, arguments);

      // Detect browser language and select Czech bundle if appropriate
      const sLang = navigator.language || navigator.userLanguage;
      const isCzech = sLang && sLang.toLowerCase().startsWith("cs");

      // Set up the i18n resource model based on detected language
      const i18nModel = new ResourceModel({
        bundleUrl: isCzech
          ? "i18n/i18n_cs.properties"
          : "i18n/i18n.properties"
      });
      this.setModel(i18nModel, "i18n");
    }
  });
});
