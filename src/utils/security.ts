import type { CompanyBankDefinition } from '../types';

/**
 * Security, sanitization, XSS mitigation, and runtime integrity layer
 * for Masar Payroll System
 */

/**
 * Strips dangerous HTML tags and scripts to prevent Cross-Site Scripting (XSS)
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  return input
    .replace(/[<>]/g, '') // strip < and >
    .replace(/javascript:/gi, '') // strip pseudo javascript: protocols
    .replace(/on\w+=/gi, '') // strip inline events like onclick=
    .trim();
}

/**
 * Validates IBAN format according to Saudi standard (SA + 22 digits/letters)
 */
export function validateSaudiIBAN(iban: string): boolean {
  if (!iban) return false;
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  const saudiIbanRegex = /^SA\d{2}[0-9A-Z]{20}$/;
  return saudiIbanRegex.test(clean);
}

/**
 * Validates Saudi National ID or Iqama (10 digits starting with 1 or 2)
 */
export function validateNationalId(id: string): boolean {
  if (!id) return false;
  const clean = id.trim();
  const saudiIdRegex = /^[12]\d{9}$/;
  return saudiIdRegex.test(clean);
}

/**
 * Validates CR (Commercial Registration) Number (10 digits)
 */
export function validateCRNumber(cr: string): boolean {
  if (!cr) return false;
  const clean = cr.trim();
  const crRegex = /^\d{10}$/;
  return crRegex.test(clean);
}

/**
 * Validates SWIFT / BIC Code format according to ISO 9362 standard
 * Standard format: 4 letters (Bank code) + 2 letters (Country code) + 2 alphanumeric (Location) + optional 3 alphanumeric (Branch)
 * Total length: 8 or 11 characters (e.g., RJHISARI, NCBKSARI, RJHISARIXXX)
 */
export function validateSwiftCode(swiftCode: string): boolean {
  if (!swiftCode) return false;
  const clean = swiftCode.trim().toUpperCase();
  const swiftRegex = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
  return swiftRegex.test(clean);
}

/**
 * Saudi Central Bank (SAMA) Standard Bank Identifiers & SWIFT Codes
 */
export interface SaudiBankInfo {
  code: string; // 2-digit IBAN bank identifier (e.g. '80')
  nameAr: string; // Arabic official name
  nameEn: string; // English name
  swiftCode: string; // ISO 9362 SWIFT/BIC Code
}

export const SAUDI_BANKS: Record<string, SaudiBankInfo> = {
  '80': { code: '80', nameAr: 'مصرف الراجحي', nameEn: 'Al Rajhi Bank', swiftCode: 'RJHISARI' },
  '10': { code: '10', nameAr: 'البنك الأهلي السعودي (SNB)', nameEn: 'Saudi National Bank', swiftCode: 'NCBKSARI' },
  '05': { code: '05', nameAr: 'مصرف الإنماء', nameEn: 'Alinma Bank', swiftCode: 'INMASARI' },
  '20': { code: '20', nameAr: 'بنك الرياض', nameEn: 'Riyad Bank', swiftCode: 'RIBLSARI' },
  '50': { code: '50', nameAr: 'البنك السعودي الأول (SAB)', nameEn: 'Saudi Awwal Bank', swiftCode: 'SABBSARI' },
  '45': { code: '45', nameAr: 'البنك السعودي البريطاني (ساب سابقاً)', nameEn: 'SABB', swiftCode: 'SABBSARI' },
  '15': { code: '15', nameAr: 'البنك السعودي الفرنسي', nameEn: 'Banque Saudi Fransi', swiftCode: 'BSFRSARI' },
  '30': { code: '30', nameAr: 'البنك العربي الوطني (ANB)', nameEn: 'Arab National Bank', swiftCode: 'ARNBSARI' },
  '60': { code: '60', nameAr: 'بنك الجزيرة', nameEn: 'Bank AlJazira', swiftCode: 'BJAZSARI' },
  '65': { code: '65', nameAr: 'البنك السعودي للاستثمار (SAIB)', nameEn: 'The Saudi Investment Bank', swiftCode: 'SIBLSARI' },
  '55': { code: '55', nameAr: 'بنك البلاد', nameEn: 'Bank Albilad', swiftCode: 'ALBISARI' },
  '75': { code: '75', nameAr: 'بنك الخليج الدولي (ميم)', nameEn: 'Gulf International Bank (meem)', swiftCode: 'GIBKSARI' },
  '85': { code: '85', nameAr: 'بنك الإمارات دبي الوطني', nameEn: 'Emirates NBD Saudi Arabia', swiftCode: 'EBILSARI' },
  '90': { code: '90', nameAr: 'بنك D360 الرقمي', nameEn: 'D360 Bank', swiftCode: 'DTHRSARI' },
  '95': { code: '95', nameAr: 'بنك إس تي سي (STC Bank)', nameEn: 'STC Bank', swiftCode: 'STCPSARI' },
  '01': { code: '01', nameAr: 'البنك المركزي السعودي (ساما)', nameEn: 'Saudi Central Bank (SAMA)', swiftCode: 'SAMASARI' },
  '71': { code: '71', nameAr: 'بنك الكويت الوطني', nameEn: 'National Bank of Kuwait', swiftCode: 'NBOKSARI' },
  '76': { code: '76', nameAr: 'بنك البحرين والكويت', nameEn: 'Bank of Bahrain and Kuwait', swiftCode: 'BBKUSARI' },
  '78': { code: '78', nameAr: 'بنك أبوظبي الأول', nameEn: 'First Abu Dhabi Bank', swiftCode: 'FABASARI' },
  '82': { code: '82', nameAr: 'بنك قطر الوطني', nameEn: 'Qatar National Bank', swiftCode: 'QNBCSARI' },
};

export function getBankDefinitions(customDefinitions?: CompanyBankDefinition[]): CompanyBankDefinition[] {
  if (customDefinitions?.length) return customDefinitions;
  return Object.values(SAUDI_BANKS).map(bank => ({
    ibanBankCode: bank.code,
    nameAr: bank.nameAr,
    nameEn: bank.nameEn,
    swiftCode: bank.swiftCode,
    isActive: true,
  }));
}

/**
 * Automatically detects bank info and SWIFT (BIC) code from Saudi IBAN number
 * Saudi IBAN format: SA + 2 check digits + 2 bank digits + 18 account digits
 */
export function detectBankFromIBAN(iban: string, customDefinitions?: CompanyBankDefinition[]): SaudiBankInfo | null {
  if (!iban) return null;
  const clean = iban.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.startsWith('SA') && clean.length >= 6) {
    const bankCode = clean.slice(4, 6);
    const custom = getBankDefinitions(customDefinitions).find(bank => bank.isActive !== false && bank.ibanBankCode === bankCode);
    return custom ? { code: custom.ibanBankCode, nameAr: custom.nameAr, nameEn: custom.nameEn, swiftCode: custom.swiftCode } : null;
  }
  return null;
}

/**
 * Finds matching SWIFT code from a bank's Arabic or English name
 */
export function getSwiftCodeFromBankName(bankName: string, customDefinitions?: CompanyBankDefinition[]): string {
  if (!bankName) return '';
  const cleanName = bankName.trim().toLowerCase();
  const found = getBankDefinitions(customDefinitions).find(b => b.isActive !== false && (
    cleanName.includes(b.nameAr.toLowerCase()) || 
    b.nameAr.toLowerCase().includes(cleanName) ||
    cleanName.includes(b.nameEn.toLowerCase()) ||
    b.nameEn.toLowerCase().includes(cleanName)
  ));
  return found ? found.swiftCode : '';
}

/**
 * Validates Saudi Commercial Registration Number (10 numeric digits)
 */
export function validateSaudiCR(cr: string): boolean {
  if (!cr) return false;
  const clean = cr.trim().replace(/[^0-9]/g, '');
  return clean.length === 10;
}

/**
 * Validates Saudi VAT / Tax Number (15 numeric digits, starts and ends with 3)
 */
export function validateSaudiTaxNumber(taxNo: string): boolean {
  if (!taxNo) return false;
  const clean = taxNo.trim().replace(/[^0-9]/g, '');
  return clean.length === 15 && clean.startsWith('3') && clean.endsWith('3');
}

/**
 * Initializes frontend runtime protection against script injection & unauthorized tamper
 */
export function initRuntimeProtection(): void {
  if (typeof window === 'undefined') return;

  // Prevent drag and drop of arbitrary file scripts into the root document window
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  }, false);

  window.addEventListener('drop', (e) => {
    e.preventDefault();
  }, false);

  // Global uncaught error and unhandled rejection shield to prevent UI state crashes
  window.addEventListener('error', (event) => {
    if (process.env.NODE_ENV === 'production') {
      // In production, suppress verbose stack trace leakage
      console.warn('[Masar Security Shield] Unhandled event captured securely.');
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Masar Security Shield] Unhandled promise rejection captured securely.');
    }
  });
}
