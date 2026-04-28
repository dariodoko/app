(function attachLicenseService(globalScope) {
  function normalizeBilling(billing) {
    return billing && typeof billing === "object" ? billing : null;
  }

  function hasActiveLicense(billing) {
    const normalized = normalizeBilling(billing);
    if (!normalized) {
      return false;
    }

    return Boolean(normalized.licenseActive || normalized.accessActive);
  }

  function getLicenseState(billing) {
    const normalized = normalizeBilling(billing);
    if (!normalized) {
      return "unknown";
    }

    if (hasActiveLicense(normalized)) {
      return "active";
    }

    const status = String(normalized.licenseStatus || "").toLowerCase();
    if (status === "expired") {
      return "expired";
    }

    if (normalized.licenseExpiresAt) {
      const expiresAt = new Date(normalized.licenseExpiresAt).getTime();
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        return "expired";
      }
    }

    return "inactive";
  }

  async function fetchStatus(apiClient) {
    return apiClient("/api/billing/status");
  }

  async function restorePurchases(apiClient) {
    return apiClient("/api/billing/restore", { method: "POST" });
  }

  globalScope.licenseService = {
    normalizeBilling,
    hasActiveLicense,
    getLicenseState,
    fetchStatus,
    restorePurchases,
  };
})(window);
