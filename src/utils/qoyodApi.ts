import { Company, JournalBatch, QoyodApiConfig, QoyodJournalEntryPayload, QoyodJournalEntryResponse, QoyodAmountItem } from '../types';

/**
 * Builds the official Qoyod API 2.0 Journal Entry payload.
 * Matches endpoint: POST https://api.qoyod.com/2.0/journal_entries
 */
export function buildQoyodJournalPayload(batch: JournalBatch, company: Company): QoyodJournalEntryPayload {
  const debitAmounts: QoyodAmountItem[] = [];
  const creditAmounts: QoyodAmountItem[] = [];

  const lines = batch?.lines || [];
  lines.forEach((line) => {
    // Determine account identifier (numeric ID or code)
    const rawAccountId = (line.accountCode || '1000').toString().trim();
    const accountId = !isNaN(Number(rawAccountId)) ? Number(rawAccountId) : rawAccountId;

    if (line.debit > 0) {
      debitAmounts.push({
        account_id: accountId,
        amount: Number(line.debit.toFixed(2)),
        comment: line.descriptionAr 
          ? `${line.descriptionAr} (${line.debit.toFixed(2)} ر.س)`
          : `مدين ${line.debit.toFixed(2)} ريال - ${line.accountNameAr || ''}`,
      });
    }

    if (line.credit > 0) {
      creditAmounts.push({
        account_id: accountId,
        amount: Number(line.credit.toFixed(2)),
        comment: line.descriptionAr 
          ? `${line.descriptionAr} (${line.credit.toFixed(2)} ر.س)`
          : `دائن ${line.credit.toFixed(2)} ريال - ${line.accountNameAr || ''}`,
      });
    }
  });

  return {
    journal_entry: {
      description: `قيد مسير رواتب شهر ${batch?.periodMonth || ''} - ${company?.nameAr || ''} (${batch?.batchNumber || ''})`,
      date: batch?.date || new Date().toISOString().split('T')[0],
      debit_amounts: debitAmounts,
      credit_amounts: creditAmounts,
    },
  };
}

/**
 * Generates an exact cURL command matching Qoyod API 2.0 documentation.
 */
export function generateQoyodCurlCommand(
  payload: QoyodJournalEntryPayload, 
  apiKey: string, 
  baseUrl: string = 'https://api.qoyod.com/2.0'
): string {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/journal_entries`;
  const cleanKey = apiKey ? apiKey.trim() : 'insert-your-api-key-here';
  const jsonString = JSON.stringify(payload, null, 2);

  return `curl --location '${endpoint}' \\
--header 'Content-Type: application/json' \\
--header 'API-KEY: ${cleanKey}' \\
--data '${jsonString.replace(/'/g, "'\\''")}'`;
}

/**
 * Sends the journal entry through the authenticated server proxy.
 * The API key never leaves the server and failed requests are never reported as success.
 */
export async function sendJournalEntryToQoyod(
  batch: JournalBatch,
  company: Company,
  config: QoyodApiConfig
): Promise<{
  success: boolean;
  message: string;
  responseData?: QoyodJournalEntryResponse;
  curlCommand: string;
}> {
  const payload = buildQoyodJournalPayload(batch, company);
  const baseUrl = (config.baseUrl || 'https://api.qoyod.com/2.0').replace(/\/+$/, '');
  const curlCommand = generateQoyodCurlCommand(payload, '[محفوظ بأمان على الخادم]', baseUrl);

  try {
    const response = await fetch('/api/integrations/qoyod/journal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ companyId: company.id, payload }),
    });

    if (response.ok) {
      const data: QoyodJournalEntryResponse = await response.json();
      return {
        success: true,
        message: `تم إنشاء وترحيل قيد اليومية بنجاح في برنامج قيود برقم مرجعي: (ID: ${data.id}) بقيمة إجمالية ${data.total_debit || batch.totalDebit} ر.س`,
        responseData: data,
        curlCommand,
      };
    } else {
      const errJson = await response.json().catch(() => ({}));
      const parsedErr = errJson.message || errJson.error;

      return {
        success: false,
        message: `استجابة خادم قيود (${response.status}): ${parsedErr || 'تعذر معالجة الطلب'}`,
        curlCommand,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'تعذر الاتصال بخادم ترحيل قيود.',
      curlCommand,
    };
  }
}
