-- ====================================================================
-- MASAR PAYROLL SYSTEM (نظام مسار للرواتب والامتثال المالي)
-- PostgreSQL Production Schema Definition
-- Supports: Multi-tenant Companies, Multi-role Users, Employees, Attendance,
--           Payroll Runs, Loans, Penalties, Journals & Qoyod Integration
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. COMPANIES TABLE (الشركات والمنشآت)
CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    company_code VARCHAR(32) NOT NULL UNIQUE,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    logo TEXT,
    cr_number VARCHAR(20) NOT NULL,
    tax_number VARCHAR(30) NOT NULL,
    gosi_establishment_no VARCHAR(30) NOT NULL,
    bank_name VARCHAR(100) DEFAULT 'مصرف الراجحي',
    bank_iban VARCHAR(34) NOT NULL,
    currency VARCHAR(10) DEFAULT 'SAR',
    timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
    fiscal_year_start_month INT DEFAULT 1,
    payroll_cutoff_day INT DEFAULT 25,
    payroll_payment_day INT DEFAULT 27,
    work_days_per_month INT DEFAULT 30,
    daily_work_hours NUMERIC(4,2) DEFAULT 8.0,
    calculation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    chart_of_accounts JSONB NOT NULL DEFAULT '{}'::jsonb,
    cost_centers JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. USERS & ROLES TABLE (المستخدمين وصلاحيات الدخول)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(30),
    role VARCHAR(32) NOT NULL DEFAULT 'PAYROLL_SPECIALIST', -- ADMIN, HR_MANAGER, PAYROLL_SPECIALIST, AUDITOR
    avatar VARCHAR(10),
    is_active BOOLEAN DEFAULT TRUE,
    company_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    employee_id VARCHAR(64),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. EMPLOYEES TABLE (الموظفين)
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_no VARCHAR(50) NOT NULL,
    first_name_ar VARCHAR(100) NOT NULL,
    last_name_ar VARCHAR(100) NOT NULL,
    first_name_en VARCHAR(100),
    last_name_en VARCHAR(100),
    national_id_or_iqama VARCHAR(20) NOT NULL,
    nationality VARCHAR(20) NOT NULL DEFAULT 'SAUDI', -- SAUDI, NON_SAUDI
    country VARCHAR(100) DEFAULT 'المملكة العربية السعودية',
    email VARCHAR(255),
    phone VARCHAR(30),
    department VARCHAR(100) NOT NULL,
    job_title VARCHAR(100) NOT NULL,
    cost_center_id VARCHAR(64),
    hire_date DATE NOT NULL,
    salary_start_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED
    suspension_start_date DATE,
    suspension_end_date DATE,
    suspension_reason TEXT,
    bank_name VARCHAR(100) NOT NULL,
    bank_iban VARCHAR(34) NOT NULL,
    salary_package JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_company_employee_no UNIQUE (company_id, employee_no)
);

-- 5. ATTENDANCE & TIMESHEET TABLE (سجلات الحضور والغياب والعمل الإضافي)
CREATE TABLE IF NOT EXISTS attendance_records (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id VARCHAR(64) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    period_month VARCHAR(7) NOT NULL, -- YYYY-MM
    date DATE NOT NULL,
    delay_minutes INT DEFAULT 0,
    absence BOOLEAN DEFAULT FALSE,
    unpaid_leave BOOLEAN DEFAULT FALSE,
    overtime_hours NUMERIC(5,2) DEFAULT 0,
    overtime_type VARCHAR(20) DEFAULT 'STANDARD', -- STANDARD (1.5x), WEEKEND (2.0x)
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. LEAVES TABLE (طلبات الإجازات)
CREATE TABLE IF NOT EXISTS leave_requests (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id VARCHAR(64) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL, -- ANNUAL, SICK, UNPAID, EMERGENCY, PATERNITY, MATERNITY
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. LOANS & ADVANCES TABLE (السلف وجداول الاستقطاع)
CREATE TABLE IF NOT EXISTS loans (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id VARCHAR(64) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    total_amount NUMERIC(12,2) NOT NULL,
    monthly_installment NUMERIC(12,2) NOT NULL,
    total_installments INT NOT NULL,
    remaining_installments INT NOT NULL,
    remaining_amount NUMERIC(12,2) NOT NULL,
    start_date VARCHAR(7) NOT NULL, -- YYYY-MM
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, PAUSED
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. PENALTIES TABLE (المخالفات والجزاءات الإدارية)
CREATE TABLE IF NOT EXISTS penalties (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id VARCHAR(64) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    period_month VARCHAR(7) NOT NULL, -- YYYY-MM
    type VARCHAR(30) NOT NULL, -- DAYS, FIXED_AMOUNT, PERCENTAGE
    value NUMERIC(12,2) NOT NULL,
    calculated_amount NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. PAYROLL RUNS TABLE (مسيرات الرواتب الشهرية)
CREATE TABLE IF NOT EXISTS payroll_runs (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    period_month VARCHAR(7) NOT NULL, -- YYYY-MM
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT', -- DRAFT, UNDER_REVIEW, APPROVED, POSTED
    title_ar VARCHAR(255) NOT NULL,
    title_en VARCHAR(255),
    cutoff_date DATE NOT NULL,
    payment_date DATE NOT NULL,
    employees_count INT NOT NULL DEFAULT 0,
    total_basic_salaries NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_housing_allowance NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_transport_allowance NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_overtime_allowance NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_other_allowances NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_gross_salaries NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_absence_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_delay_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_gosi_employee NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_gosi_employer NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_loan_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_penalties NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_net_salaries NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_company_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    journal_batch_id VARCHAR(64),
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    posted_by VARCHAR(255),
    posted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_company_payroll_period UNIQUE (company_id, period_month)
);

-- 10. ACCOUNTING JOURNALS TABLE (القيود المحاسبية وتكامل قيود)
CREATE TABLE IF NOT EXISTS journal_batches (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    payroll_run_id VARCHAR(64) REFERENCES payroll_runs(id) ON DELETE SET NULL,
    batch_number VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    description_ar TEXT NOT NULL,
    description_en TEXT,
    total_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_balanced BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT', -- DRAFT, POSTED, SYNCED_QOYOD
    qoyod_reference_id VARCHAR(100),
    qoyod_synced_at TIMESTAMP WITH TIME ZONE,
    entries JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. AUDIT LOGS TABLE (سجل العمليات والرقابة)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    company_id VARCHAR(64) REFERENCES companies(id) ON DELETE CASCADE,
    user_id VARCHAR(64),
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(32) NOT NULL,
    action VARCHAR(64) NOT NULL,
    entity VARCHAR(64),
    entity_id VARCHAR(64),
    description_ar TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. INITIAL ADMIN SEED (فقط المستخدم الرئيسي بدون بيانات تجريبية وهمية)
INSERT INTO companies (
    id, company_code, name_ar, name_en, cr_number, tax_number, gosi_establishment_no, bank_name, bank_iban
) VALUES (
    'comp-1', '101', 'شركة التقنية المتقدمة للحلول الرقمية', 'Advanced Tech Digital Solutions Ltd.',
    '1010892341', '310293847500003', '72910482', 'مصرف الراجحي', 'SA4480000100608010101010'
) ON CONFLICT (company_code) DO NOTHING;

INSERT INTO users (
    id, username, password_hash, name, email, phone, role, company_ids, is_active
) VALUES (
    'user-admin', 'admin', 'admin', 'مسؤول النظام (Admin)', 'admin@masar.sa', '0500000001', 'ADMIN', '["comp-1"]'::jsonb, TRUE
) ON CONFLICT (username) DO NOTHING;

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_period ON attendance_records(company_id, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(company_id, period_month);
CREATE INDEX IF NOT EXISTS idx_loans_employee ON loans(employee_id);
