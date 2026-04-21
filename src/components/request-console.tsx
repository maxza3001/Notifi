"use client";

import clsx from "clsx";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
  useRef,
} from "react";

import { getStatusTone, dashboardStatusValues } from "@/lib/statuses";
import type { RequestRecord } from "@/lib/types";

type FlashState = {
  type: "success" | "error";
  title: string;
  message: string;
} | null;

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  agency: "",
  citizenId: "",
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message || "คำขอไม่สำเร็จ");
  }

  return payload as T;
}

function validateCitizenIdLocal(id: string) {
  if (!/^\d{13}$/.test(id)) return false;

  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(id.charAt(index)) * (13 - index);
  }

  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === Number(id.charAt(12));
}

async function fetchRequestsFromApi() {
  const response = await fetch("/api/requests", {
    method: "GET",
    cache: "no-store",
  });

  return parseResponse<RequestRecord[]>(response);
}

export function RequestConsole({ agencies }: { agencies: readonly string[] }) {
  const [activeTab, setActiveTab] = useState<"form" | "dashboard">("form");
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [showCitizenId, setShowCitizenId] = useState(false);
  const [citizenIdError, setCitizenIdError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [requestsError, setRequestsError] = useState("");
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | (typeof dashboardStatusValues)[number]>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [flash, setFlash] = useState<FlashState>(null);
  const [modalRequest, setModalRequest] = useState<RequestRecord | null>(null);
  const [modalStatus, setModalStatus] = useState<(typeof dashboardStatusValues)[number]>("รออนุมัติ");
  const [modalNote, setModalNote] = useState("");
  const [modalNotify, setModalNotify] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  const flashTimerRef = useRef<number | null>(null);
  const deferredSearchTerm = useDeferredValue(searchTerm.trim().toLowerCase());

  function pushFlash(nextFlash: FlashState) {
    setFlash(nextFlash);

    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
    }

    flashTimerRef.current = window.setTimeout(() => {
      setFlash(null);
    }, 4_000);
  }

  async function loadRequests(silent = false) {
    if (!silent) {
      setIsLoadingRequests(true);
    }

    try {
      const data = await fetchRequestsFromApi();
      startTransition(() => {
        setRequests(data);
        setRequestsError("");
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "โหลดข้อมูลล้มเหลว";
      if (!silent) {
        setRequestsError(message);
      }
    } finally {
      if (!silent) {
        setIsLoadingRequests(false);
      }
    }
  }

  const refreshDashboardPoll = useEffectEvent(async () => {
    try {
      const data = await fetchRequestsFromApi();
      startTransition(() => {
        setRequests(data);
        setRequestsError("");
      });
    } catch {
      // Ignore polling errors so the dashboard keeps the last good state.
    }
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await fetchRequestsFromApi();
        if (cancelled) return;

        startTransition(() => {
          setRequests(data);
          setRequestsError("");
        });
      } catch (error) {
        if (!cancelled) {
          setRequestsError(error instanceof Error ? error.message : "โหลดข้อมูลล้มเหลว");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRequests(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (activeTab === "dashboard") {
        void refreshDashboardPoll();
      }
    }, 2_500);

    return () => window.clearInterval(intervalId);
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  const filteredRequests = requests.filter((request) => {
    const haystack = `${request.fullName}${request.agency}${request.maskedCitizenId}`.toLowerCase();
    const matchesText = !deferredSearchTerm || haystack.includes(deferredSearchTerm);
    const matchesStatus = statusFilter === "all" || request.status === statusFilter;
    return matchesText && matchesStatus;
  });

  function resetForm() {
    setFormData(INITIAL_FORM);
    setCitizenIdError("");
    setShowCitizenId(false);
  }

  function handleCitizenIdChange(value: string) {
    const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 13);
    setFormData((current) => ({ ...current, citizenId: digitsOnly }));

    if (digitsOnly.length === 13) {
      setCitizenIdError(validateCitizenIdLocal(digitsOnly) ? "" : "เลขประจำตัวประชาชนไม่ถูกต้อง");
      return;
    }

    setCitizenIdError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateCitizenIdLocal(formData.citizenId)) {
      setCitizenIdError("เลขประจำตัวประชาชนไม่ถูกต้อง");
      pushFlash({
        type: "error",
        title: "ข้อมูลไม่ถูกต้อง",
        message: "กรุณาตรวจสอบเลขประจำตัวประชาชน 13 หลักก่อนบันทึก",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const result = await parseResponse<{ message: string }>(response);
      pushFlash({
        type: "success",
        title: "บันทึกสำเร็จ",
        message: result.message,
      });
      resetForm();
      void loadRequests(true);
    } catch (error) {
      pushFlash({
        type: "error",
        title: "บันทึกไม่สำเร็จ",
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function openModal(request: RequestRecord) {
    setModalRequest(request);
    setModalStatus(
      dashboardStatusValues.includes(request.status as (typeof dashboardStatusValues)[number])
        ? (request.status as (typeof dashboardStatusValues)[number])
        : "รออนุมัติ",
    );
    setModalNote(request.note === "-" ? "" : request.note);
    setModalNotify(false);
  }

  function closeModal() {
    setModalRequest(null);
    setModalNote("");
    setModalNotify(false);
  }

  async function handleSaveStatus() {
    if (!modalRequest) return;

    setIsSavingStatus(true);

    try {
      const response = await fetch(`/api/requests/${modalRequest.reqId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: modalStatus,
          note: modalNote,
          sendNotification: modalNotify,
        }),
      });

      await parseResponse<{ success: boolean }>(response);
      closeModal();
      pushFlash({
        type: "success",
        title: "อัปเดตสถานะสำเร็จ",
        message: `คำขอ ${modalRequest.reqId} ถูกอัปเดตเป็น ${modalStatus} แล้ว`,
      });
      void loadRequests(false);
    } catch (error) {
      pushFlash({
        type: "error",
        title: "อัปเดตสถานะไม่สำเร็จ",
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      });
    } finally {
      setIsSavingStatus(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-frame">
        <header className="hero-bar">
          <div className="hero-brand">
            <div className="hero-brand-badge">🛡️</div>
            <div className="hero-copy">
              <h1>ระบบแจ้งเตือนคำขอหนังสือบำเหน็จค้ำประกัน</h1>
              <p>ย้ายมาใช้ Next.js + Supabase โดยยังคง flow เดิมของฟอร์ม, dashboard และ Telegram status buttons</p>
            </div>
          </div>
          <div className="hero-status">
            <span className="hero-status-dot" />
            Live workflow
          </div>
        </header>

        <div className="control-row">
          <div className="tab-set" role="tablist" aria-label="เลือกมุมมอง">
            <button
              type="button"
              className={clsx("tab-button", activeTab === "form" && "is-active")}
              onClick={() => startTransition(() => setActiveTab("form"))}
            >
              📝 แบบฟอร์ม
            </button>
            <button
              type="button"
              className={clsx("tab-button", activeTab === "dashboard" && "is-active")}
              onClick={() => startTransition(() => setActiveTab("dashboard"))}
            >
              📊 แดชบอร์ด
            </button>
          </div>
        </div>

        {requestsError ? (
          <div className="setup-note">
            <strong>ระบบยังไม่พร้อมใช้งานเต็มรูปแบบ</strong>
            <div>{requestsError}</div>
            <div>ตรวจสอบ `.env.local` และรัน SQL schema ของ Supabase ก่อนใช้งานครั้งแรก</div>
          </div>
        ) : null}

        <div className="layout-grid">
          {activeTab === "form" ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">บันทึกคำขอใหม่</div>
                  <div className="panel-subtitle">กรอกข้อมูลให้ครบถ้วน ระบบจะส่งแจ้งเตือน Telegram และแนบปุ่มสถานะตามค่าใน settings</div>
                </div>
                <div className="panel-chip">เริ่มต้นสถานะ: รออนุมัติ</div>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="firstName">ชื่อ</label>
                    <input
                      id="firstName"
                      className="input"
                      value={formData.firstName}
                      onChange={(event) => setFormData((current) => ({ ...current, firstName: event.target.value }))}
                      placeholder="กรอกชื่อ"
                      autoComplete="off"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="lastName">นามสกุล</label>
                    <input
                      id="lastName"
                      className="input"
                      value={formData.lastName}
                      onChange={(event) => setFormData((current) => ({ ...current, lastName: event.target.value }))}
                      placeholder="กรอกนามสกุล"
                      autoComplete="off"
                    />
                  </div>

                  <div className="field full">
                    <label htmlFor="agency">สังกัดส่วนราชการ</label>
                    <select
                      id="agency"
                      className="select"
                      value={formData.agency}
                      onChange={(event) => setFormData((current) => ({ ...current, agency: event.target.value }))}
                    >
                      <option value="">-- เลือกส่วนราชการ --</option>
                      {agencies.map((agency) => (
                        <option key={agency} value={agency}>
                          {agency}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field full">
                    <label htmlFor="citizenId">เลขประจำตัวประชาชน (13 หลัก)</label>
                    <div className="input-row">
                      <input
                        id="citizenId"
                        className="input mono"
                        type={showCitizenId ? "text" : "password"}
                        inputMode="numeric"
                        maxLength={13}
                        value={formData.citizenId}
                        onChange={(event) => handleCitizenIdChange(event.target.value)}
                        placeholder="กรอกเลขประจำตัวประชาชน"
                      />
                      <button
                        type="button"
                        className="input-affix"
                        onClick={() => setShowCitizenId((current) => !current)}
                        aria-label={showCitizenId ? "ซ่อนเลขบัตร" : "แสดงเลขบัตร"}
                      >
                        {showCitizenId ? "🙈" : "👁️"}
                      </button>
                    </div>
                    <div className={clsx("helper-text", citizenIdError && "is-error")}>
                      {citizenIdError || "ระบบจะตรวจสอบเลขบัตรตามหลักกรมการปกครองก่อนบันทึก"}
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <button type="button" className="button-secondary" onClick={resetForm} disabled={isSubmitting}>
                    ล้างฟอร์ม
                  </button>
                  <button type="submit" className="button-primary" disabled={isSubmitting}>
                    {isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <section className="panel">
              <div className="toolbar">
                <div className="toolbar-stats">
                  <strong>{filteredRequests.length}</strong> รายการที่แสดง
                  <div>รีเฟรชอัตโนมัติทุก 2.5 วินาทีเมื่อเปิดหน้าแดชบอร์ด</div>
                </div>

                <div className="toolbar-actions">
                  <div className="search-shell">
                    <span>🔎</span>
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="ค้นหา ชื่อ, หน่วยงาน, เลขบัตรปกปิด"
                    />
                  </div>

                  <select
                    className="select"
                    style={{ minWidth: 164 }}
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as "all" | (typeof dashboardStatusValues)[number])}
                  >
                    <option value="all">ทุกสถานะ</option>
                    {dashboardStatusValues.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="button-icon"
                    onClick={() => void loadRequests(false)}
                    aria-label="รีเฟรชข้อมูล"
                  >
                    ↻
                  </button>
                </div>
              </div>

              <div className="table-shell">
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>วันที่-เวลา</th>
                        <th>ชื่อ-นามสกุล</th>
                        <th>ส่วนราชการ</th>
                        <th>เลขบัตร (ปกปิด)</th>
                        <th>สถานะ</th>
                        <th>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingRequests ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="empty-state">กำลังโหลดข้อมูล...</div>
                          </td>
                        </tr>
                      ) : filteredRequests.length === 0 ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="empty-state">
                              <div>
                                <strong>ไม่พบข้อมูลที่ตรงกับเงื่อนไข</strong>
                                <div>ลองเปลี่ยนคำค้นหาหรือสถานะที่กรองอยู่</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredRequests.map((request) => (
                          <tr key={request.id}>
                            <td>
                              <div className="row-primary">{request.requestDate}</div>
                              <div className="row-secondary">{request.requestTime}</div>
                            </td>
                            <td className="row-primary">{request.fullName}</td>
                            <td className="row-secondary">{request.agency}</td>
                            <td className="mono row-secondary">{request.maskedCitizenId}</td>
                            <td>
                              <span className={clsx("status-badge", getStatusTone(request.status))}>
                                {request.status}
                              </span>
                            </td>
                            <td>
                              <button type="button" className="button-secondary" onClick={() => openModal(request)}>
                                จัดการ
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>

        {modalRequest ? (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="status-modal-title">
              <h3 id="status-modal-title">อัปเดตสถานะคำขอ</h3>
              <p>{modalRequest.reqId} • {modalRequest.fullName}</p>

              <div className="field-grid" style={{ marginTop: 20 }}>
                <div className="field full">
                  <label htmlFor="modalStatus">สถานะใหม่</label>
                  <select
                    id="modalStatus"
                    className="select"
                    value={modalStatus}
                    onChange={(event) => setModalStatus(event.target.value as (typeof dashboardStatusValues)[number])}
                  >
                    {dashboardStatusValues.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field full">
                  <label htmlFor="modalNote">หมายเหตุ</label>
                  <input
                    id="modalNote"
                    className="input"
                    value={modalNote}
                    onChange={(event) => setModalNote(event.target.value)}
                    placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)"
                  />
                </div>

                <div className="field full">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={modalNotify}
                      onChange={(event) => setModalNotify(event.target.checked)}
                    />
                    ส่งแจ้งเตือน Telegram ด้วย
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="button-secondary" onClick={closeModal} disabled={isSavingStatus}>
                  ยกเลิก
                </button>
                <button type="button" className="button-primary" onClick={handleSaveStatus} disabled={isSavingStatus}>
                  {isSavingStatus ? "กำลังบันทึก..." : "บันทึกสถานะ"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {flash ? (
          <div className={clsx("flash", flash.type)}>
            <strong>{flash.title}</strong>
            <div>{flash.message}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
