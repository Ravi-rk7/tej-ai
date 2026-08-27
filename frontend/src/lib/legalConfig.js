const clean = (value) => typeof value === "string" && value.trim() ? value.trim() : null;

export const LEGAL_CONFIG = Object.freeze({
    brandName: "TejAi",
    legalBusinessName: clean(process.env.NEXT_PUBLIC_LEGAL_BUSINESS_NAME),
    supportEmail: clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
    privacyEmail: clean(process.env.NEXT_PUBLIC_PRIVACY_EMAIL),
    businessAddress: clean(process.env.NEXT_PUBLIC_LEGAL_BUSINESS_ADDRESS),
    operatingCountry: clean(process.env.NEXT_PUBLIC_LEGAL_OPERATING_COUNTRY),
    governingLaw: clean(process.env.NEXT_PUBLIC_LEGAL_GOVERNING_LAW),
    privacyEffectiveDate: clean(process.env.NEXT_PUBLIC_PRIVACY_EFFECTIVE_DATE),
});

export const isLegalConfigComplete = () => Boolean(
    LEGAL_CONFIG.legalBusinessName
    && LEGAL_CONFIG.supportEmail
    && LEGAL_CONFIG.privacyEmail
    && LEGAL_CONFIG.operatingCountry
    && LEGAL_CONFIG.governingLaw
    && LEGAL_CONFIG.privacyEffectiveDate
);

export default LEGAL_CONFIG;
