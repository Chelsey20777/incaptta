export const BRAND_CONFIG = {
  name: import.meta.env.VITE_COMPANY_NAME || "Incaptta",
  tagline: import.meta.env.VITE_COMPANY_TAGLINE || "",
  logoText: import.meta.env.VITE_LOGO_TEXT || "IP", // E.g., "IP" or "DK"
  defaultFavicon: import.meta.env.VITE_FAVICON_URL || "",
  defaultAddress: import.meta.env.VITE_DEFAULT_ADDRESS || "No. 46 Northampton Crescent Eastlea Harare",
  defaultEmail: import.meta.env.VITE_DEFAULT_EMAIL || "sales@incaptta.co.zw",
  defaultPhone: import.meta.env.VITE_DEFAULT_PHONE || "0774937250",
  defaultWebsite: import.meta.env.VITE_DEFAULT_WEBSITE || "www.incaptta.co.zw",
}
