import React, { useState } from 'react';
import { 
  History, 
  ShieldCheck, 
  Search, 
  Calendar, 
  UserCheck, 
  AlertCircle, 
  Clock,
  Filter
} from 'lucide-react';
import { AuditLog } from '../types';

interface AuditLogsViewProps {
  logs: AuditLog[];
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = logs.filter(l => 
    l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.userName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-emerald-600" />
            <span>سجل التدقيق والحركات الإدارية (Audit Trail)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            توثيق كامل لكافة عمليات إنشاء الموظفين، احتساب الرواتب، التعديلات، والترحيل المحاسبي
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="بحث في سجل العمليات..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <th className="py-3 px-4">التوقيت والتاريخ</th>
                <th className="py-3 px-4">المستخدم والمنصب</th>
                <th className="py-3 px-4">نوع العملية</th>
                <th className="py-3 px-4">الكيان المستهدف</th>
                <th className="py-3 px-4">التفاصيل والتغييرات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    لا توجد سجلات تدقيق مطابقة للبحث
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {new Date(log.timestamp).toLocaleString('ar-SA')}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {log.userName}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {log.entityType} ({log.entityId})
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
