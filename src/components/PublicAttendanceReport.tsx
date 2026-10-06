import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Eraser, PenLine, Printer } from "lucide-react";
import { api, type EmployeeAttendanceReport } from "../utils/api";

type Report = EmployeeAttendanceReport & {
  instructions?: string;
  company: { nameAr: string; nameEn: string; logo?: string };
  employee: {
    employeeNo: string;
    nameAr: string;
    nameEn: string;
    department: string;
  };
};

const dayName = (date: string) =>
  new Intl.DateTimeFormat("ar-SA", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

export const PublicAttendanceReport: React.FC = () => {
  const token = window.location.pathname.split("/").filter(Boolean).pop() || "";
  const [report, setReport] = useState<Report | null>(null),
    [comments, setComments] = useState<Record<string, string>>({}),
    [signatureName, setSignatureName] = useState("");
  const [signedAt, setSignedAt] = useState<string | null>(null),
    [signatureData, setSignatureData] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    hasInk = useRef(false);
  useEffect(() => {
    api
      .publicAttendanceReport(token)
      .then((data) => {
        setReport(data.report);
        setSignedAt(data.signedAt);
        setComments(data.response?.comments || {});
        setSignatureName(data.response?.signatureName || "");
        setSignatureData(data.response?.signatureData || "");
      })
      .catch(() => setError("الرابط غير صالح أو انتهت صلاحيته"));
  }, [token]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width),
      y:
        (event.clientY - rect.top) * (event.currentTarget.height / rect.height),
    };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (signedAt) return;
    drawing.current = true;
    hasInk.current = true;
    const ctx = event.currentTarget.getContext("2d"),
      p = point(event);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d"),
      p = point(event);
    if (ctx) {
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0f172a";
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  };
  const save = async () => {
    if (!report || signatureName.trim().length < 2 || !hasInk.current) {
      setError("اكتب الاسم وارسم التوقيع قبل الحفظ");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const image = canvasRef.current?.toDataURL("image/png") || "";
      const result = await api.respondToAttendanceReport(token, {
        signatureName: signatureName.trim(),
        signatureData: image,
        comments,
      });
      setSignatureData(image);
      setSignedAt(result.signedAt);
    } catch {
      setError(
        "تعذر حفظ الإقرار. ربما تم توقيعه مسبقًا أو انتهت صلاحية الرابط.",
      );
    } finally {
      setSaving(false);
    }
  };
  if (error && !report)
    return (
      <main
        dir="rtl"
        className="wafr-page-scroll flex items-center justify-center bg-slate-100 p-6"
      >
        <div className="rounded-3xl bg-white p-8 font-bold text-rose-700 shadow">
          {error}
        </div>
      </main>
    );
  if (!report) return <main className="wafr-page-scroll bg-slate-100" />;
  return (
    <main
      dir="rtl"
      className="attendance-print h-dvh overflow-y-auto overscroll-contain bg-slate-100 p-3 pb-12 text-slate-900 sm:p-8 print:h-auto print:overflow-visible print:bg-white print:p-0"
    >
      <style>{`@media print{@page{size:A4 landscape;margin:8mm}.attendance-print{font-size:10px!important}.attendance-sheet{width:auto!important;height:auto!important;overflow:visible!important;padding:0!important}.attendance-banner{padding:3mm 5mm!important}.attendance-banner img{height:14mm!important;max-width:34mm!important}.attendance-summary{margin:2mm 0!important;gap:2mm!important}.attendance-summary>div{padding:2mm 1mm!important}.attendance-table{min-width:0!important;font-size:9.5px!important;table-layout:fixed!important}.attendance-table thead{display:table-header-group!important}.attendance-table tr{break-inside:avoid!important;page-break-inside:avoid!important}.attendance-table th,.attendance-table td{padding:1.35mm 1mm!important;line-height:1.2!important}.attendance-table th{font-size:10px!important}.attendance-table textarea{min-height:0!important;height:5mm!important;border:0!important;padding:0!important;font-size:9.5px!important;line-height:1.15!important;resize:none!important;background:transparent!important}.attendance-sign{margin-top:4mm!important;padding:3mm!important;font-size:10px!important;break-inside:avoid!important;page-break-inside:avoid!important}.attendance-sign img{height:18mm!important}.attendance-sign p{margin:1mm 0!important}}`}</style>
      <section className="attendance-sheet mx-auto max-w-5xl rounded-3xl bg-white p-4 shadow-xl sm:p-8 print:max-w-none print:rounded-none print:shadow-none">
        <header className="attendance-banner flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-l from-emerald-800 to-teal-600 p-5 text-white print:rounded-none">
          {" "}
          <div className="flex items-center gap-4">
            {report.company.logo ? (
              <img
                src={report.company.logo}
                alt="شعار المنشأة"
                className="h-16 max-w-40 rounded-lg bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20 text-2xl font-black">
                م
              </div>
            )}
            <div>
              <h1 className="text-xl font-black">{report.company.nameAr}</h1>
              {report.company.nameEn && (
                <p className="mt-1 text-xs opacity-90">
                  {report.company.nameEn}
                </p>
              )}
              <p className="mt-1 font-bold">كشف الحضور والانصراف</p>
            </div>
          </div>
          <div className="text-left text-xs">
            <p>الفترة</p>
            <b className="text-base">{report.periodMonth}</b>
          </div>
        </header>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border p-3 text-sm print:mt-2 print:p-2">
          <span>
            الموظف: <b>{report.employee.nameAr || report.employee.nameEn}</b>
          </span>
          <span>
            الرقم: <b>{report.employee.employeeNo}</b>
          </span>
          <span>
            القسم: <b>{report.employee.department || "—"}</b>
          </span>
        </div>
        <div className="attendance-summary mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-xl border bg-rose-50 p-3 text-center"><span className="block text-xs text-slate-500">أيام الغياب</span><b>{report.summary.absenceDays}</b></div>
          <div className="rounded-xl border bg-amber-50 p-3 text-center"><span className="block text-xs text-slate-500">أيام التأخير</span><b>{report.summary.lateDays}</b></div>
          <div className="rounded-xl border bg-orange-50 p-3 text-center"><span className="block text-xs text-slate-500">إجمالي التأخير</span><b>{report.summary.totalDelayMinutes} دقيقة</b></div>
          <div className="rounded-xl border bg-blue-50 p-3 text-center"><span className="block text-xs text-slate-500">السماح</span><b>{report.records[0]?.graceMinutes || 0} دقيقة</b></div>
          <div className="rounded-xl border bg-violet-50 p-3 text-center"><span className="block text-xs text-slate-500">البصمة الناقصة</span><b>{report.summary.missingPunchDays}</b></div>
        </div>
        {report.instructions && <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm"><b>تعليمات للموظف:</b> {report.instructions}</div>}
        <div className="mt-3 overflow-x-auto print:overflow-visible">
          <table className="attendance-table w-full min-w-[1050px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                {[
                  "اليوم والتاريخ",
                  "الدوام",
                  "الدخول",
                  "الخروج",
                  "الحالة",
                  "التأخير",
                  "ملاحظات الإدارة",
                  "ملاحظات الموظف",
                ].map((x) => (
                  <th key={x} className="p-3 text-right">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.records.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="p-3"><b>{dayName(row.date)}</b><br/><span className="font-mono">{row.date}</span></td>
                  <td className="p-3">
                    {row.scheduledStart || "—"} - {row.scheduledEnd || "—"}
                  </td>
                  <td className="p-3">{row.actualCheckIn || "—"}</td>
                  <td className="p-3">{row.actualCheckOut || "—"}</td>
                  <td className="p-3 font-bold">{row.status}</td>
                  <td className="p-3">{row.delayMinutes} د</td>
                  <td className="p-2">{row.notes || "—"}</td>
                  <td className="p-2">
                    <textarea
                      disabled={Boolean(signedAt)}
                      value={comments[row.id] || ""}
                      maxLength={1000}
                      onChange={(e) =>
                        setComments({ ...comments, [row.id]: e.target.value })
                      }
                      className="min-h-16 w-full rounded-xl border p-2 disabled:bg-slate-50"
                      placeholder="تعليق اختياري على هذا اليوم"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="attendance-sign mt-6 rounded-2xl border bg-slate-50 p-5 print:break-inside-avoid">
          {signedAt ? (
            <div>
              <div className="flex items-center gap-2 font-black text-emerald-700">
                <CheckCircle2 />
                تم توقيع الإقرار إلكترونيًا بتاريخ{" "}
                {new Date(signedAt).toLocaleString("ar-SA")}
              </div>
              <div className="mt-3 grid grid-cols-2 items-center gap-4">
                <div>
                  <p className="text-sm">
                    اسم الموقّع: <b>{signatureName}</b>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    أقر الموظف بمراجعة الكشف وإثبات ملاحظاته إلكترونيًا.
                  </p>
                </div>
                {signatureData && (
                  <img
                    src={signatureData}
                    alt="توقيع الموظف"
                    className="max-h-24 w-full rounded-xl border bg-white object-contain"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-black text-white print:hidden"
              >
                <Printer className="h-4 w-4" />
                طباعة A4 الموقعة
              </button>
            </div>
          ) : (
            <>
              <h2 className="flex items-center gap-2 font-black">
                <PenLine className="h-5 w-5" />
                إقرار وتوقيع الموظف
              </h2>
              <p className="mt-2 text-xs text-slate-600">
                أقر بأنني راجعت الكشف، وأثبتت ملاحظاتي إن وجدت، وأوافق على حفظ
                اسمي وتوقيعي ووقت الإرسال كإقرار إلكتروني.
              </p>
              <input
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                maxLength={160}
                placeholder="الاسم الكامل"
                className="mt-4 w-full rounded-xl border bg-white p-3"
              />
              <div className="mt-3 overflow-hidden rounded-xl border bg-white">
                <canvas
                  ref={canvasRef}
                  width={900}
                  height={220}
                  onPointerDown={start}
                  onPointerMove={move}
                  onPointerUp={() => (drawing.current = false)}
                  onPointerCancel={() => (drawing.current = false)}
                  className="h-40 w-full touch-none"
                  aria-label="مساحة التوقيع"
                />
              </div>
              <div className="mt-3 flex flex-wrap justify-between gap-2">
                <button
                  type="button"
                  onClick={clear}
                  className="flex items-center gap-2 rounded-xl border px-4 py-2 font-bold"
                >
                  <Eraser className="h-4 w-4" />
                  مسح التوقيع
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-50"
                >
                  {saving ? "جارٍ الحفظ…" : "حفظ وإرسال الإقرار"}
                </button>
              </div>
              {error && <p className="mt-3 font-bold text-rose-700">{error}</p>}
            </>
          )}
        </div>
      </section>
    </main>
  );
};
