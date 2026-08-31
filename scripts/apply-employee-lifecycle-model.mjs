import fs from 'node:fs';

const path = 'src/types/index.ts';
let source = fs.readFileSync(path, 'utf8');

const permissionAnchor = `  | 'MANAGE_USERS'\n  | 'VIEW_AUDIT_LOGS';`;
const permissionReplacement = `  | 'MANAGE_USERS'\n  | 'RECEIVE_HR_EXPIRY_EMAILS'\n  | 'VIEW_AUDIT_LOGS';`;
if (!source.includes(permissionAnchor)) throw new Error('Lifecycle permission anchor not found');
source = source.replace(permissionAnchor, permissionReplacement);

const statusAnchor = `export type EmploymentStatus = 'ACTIVE' | 'SUSPENDED' | 'ON_LEAVE' | 'TERMINATED' | 'ABSCONDED';`;
const statusReplacement = `export type EmploymentStatus = 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'ON_LEAVE' | 'TERMINATED' | 'ABSCONDED';\nexport type IqamaIssueStatus = 'PENDING' | 'ISSUED';\nexport type BankAccountStatus = 'PENDING' | 'READY';\nexport type EmployeeOnboardingStatus = 'NEW_ARRIVAL' | 'WAITING_IQAMA' | 'WAITING_BANK' | 'COMPLETE';`;
if (!source.includes(statusAnchor)) throw new Error('Employment status anchor not found');
source = source.replace(statusAnchor, statusReplacement);

const employeeAnchor = `  salaryStartDate: string; // YYYY-MM-DD\n  prorateFirstMonth?: boolean; // Apply daily proration in the salary start month only when explicitly enabled`;
const employeeReplacement = `  salaryStartDate: string; // YYYY-MM-DD\n  prorateFirstMonth?: boolean; // Apply daily proration in the salary start month only when explicitly enabled\n  entryDate?: string; // YYYY-MM-DD, non-Saudi arrival date\n  entryNumber?: string; // Border/entry number before iqama issuance\n  iqamaNumber?: string;\n  iqamaIssueStatus?: IqamaIssueStatus;\n  iqamaExpiryDate?: string; // YYYY-MM-DD\n  contractStartDate?: string; // YYYY-MM-DD, Saudi employees\n  contractEndDate?: string; // YYYY-MM-DD, Saudi employees\n  bankAccountStatus?: BankAccountStatus;\n  onboardingStatus?: EmployeeOnboardingStatus;`;
if (!source.includes(employeeAnchor)) throw new Error('Employee lifecycle field anchor not found');
source = source.replace(employeeAnchor, employeeReplacement);

fs.writeFileSync(path, source);
console.log('Employee lifecycle model applied.');
