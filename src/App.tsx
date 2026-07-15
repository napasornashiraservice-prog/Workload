import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, auth, googleProvider } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User, GoogleAuthProvider } from 'firebase/auth';
import { createAndPopulateSpreadsheet } from './utils/sheets';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.warn('Firestore Error (falling back to offline/local storage):', JSON.stringify(errInfo));
}

import {
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Bell,
  Moon,
  Sun,
  Briefcase,
  AlertCircle,
  Users,
  BarChart3,
  Save,
  Undo,
  Check,
  X,
  TrendingUp,
  Download,
  Upload,
  UserCheck,
  FileSpreadsheet,
  PieChart
} from 'lucide-react';

// Interfaces based on requested requirements
interface SalesMember {
  id: string;
  name: string;
  avatarText: string;
  color: string;
}

interface WorkLog {
  id: string;
  salesId: string;
  date: string; // YYYY-MM-DD
  type: 'work' | 'case' | 'call';
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  details: string;
  callsCount: number; // For phone logs
  status: 'notstarted' | 'pending' | 'inprogress' | 'completed'; // ยังไม่ดำเนินการ, รอดำเนินการ, กำลังทำ, สำเร็จ
  callResult?: string; // ผลการติดต่อ: answered (รับสาย), connected (ติดต่อได้), unreachable (ติดต่อไม่ได้)
}

// Preloaded demonstration data matching the user's screenshots and details
const PRELOADED_SALES: SalesMember[] = [
  { id: 'sales-1', name: 'Ph Phere', avatarText: 'Ph', color: 'bg-emerald-500 text-white' },
  { id: 'sales-2', name: 'Fr Frame', avatarText: 'Fr', color: 'bg-slate-900 text-white border border-slate-700' },
];

const PRELOADED_LOGS: WorkLog[] = [
  // Fr Frame logs for today Wednesday 2026-06-24
  {
    id: 'log-1',
    salesId: 'sales-2',
    date: '2026-06-24',
    type: 'work',
    startTime: '09:00',
    endTime: '10:30',
    details: 'Follow-up โปรเจกต์คอนโด A1',
    callsCount: 4,
    status: 'completed'
  },
  {
    id: 'log-2',
    salesId: 'sales-2',
    date: '2026-06-24',
    type: 'work',
    startTime: '10:30',
    endTime: '12:00',
    details: 'พรีเซนต์งานผ่าน Zoom (กลุ่มลูกค้าใหม่)',
    callsCount: 8,
    status: 'completed'
  },
  {
    id: 'log-3',
    salesId: 'sales-2',
    date: '2026-06-24',
    type: 'case',
    startTime: '13:30',
    endTime: '15:00',
    details: 'จัดการเอกสารสัญญาและเคลียร์ Case ลูกค้า คุณวิโรจน์ โอนเงินไม่เข้า',
    callsCount: 2,
    status: 'inprogress'
  },
  {
    id: 'log-4',
    salesId: 'sales-2',
    date: '2026-06-24',
    type: 'work',
    startTime: '15:00',
    endTime: '17:00',
    details: 'สรุปรายงานการขายรายสัปดาห์',
    callsCount: 0,
    status: 'pending'
  },
  // Ph Phere logs for today Wednesday 2026-06-24
  {
    id: 'log-5',
    salesId: 'sales-1',
    date: '2026-06-24',
    type: 'work',
    startTime: '09:30',
    endTime: '11:00',
    details: 'ตรวจเช็คสต็อกสินค้าประจำเดือนและทำไฟล์สรุป',
    callsCount: 0,
    status: 'completed'
  },
  {
    id: 'log-6',
    salesId: 'sales-1',
    date: '2026-06-24',
    type: 'call',
    startTime: '11:00',
    endTime: '12:00',
    details: 'โทรติดตามดีลลูกค้าระดับ VIP แบรนด์ใหม่',
    callsCount: 15,
    status: 'completed',
    callResult: 'connected'
  },
  // Some logs for other days to feed the weekly chart
  {
    id: 'log-7',
    salesId: 'sales-1',
    date: '2026-06-22',
    type: 'call',
    startTime: '13:00',
    endTime: '15:30',
    details: 'โทรหาลูกค้าเป้าหมายเขตกรุงเทพและปริมณฑล',
    callsCount: 14,
    status: 'completed',
    callResult: 'connected'
  },
  {
    id: 'log-8',
    salesId: 'sales-2',
    date: '2026-06-23',
    type: 'call',
    startTime: '10:00',
    endTime: '12:30',
    details: 'โทรแนะนำแคมเปญใหม่ช่วงกลางปี',
    callsCount: 18,
    status: 'completed',
    callResult: 'unreachable'
  },
  {
    id: 'log-ph-1',
    salesId: 'sales-1',
    date: '2026-07-15',
    type: 'work',
    startTime: '09:00',
    endTime: '10:40',
    details: 'เคลียร์เคส ตอบเพจ ดูระบบ สมัครแอคเคาท์',
    callsCount: 0,
    status: 'completed'
  },
  {
    id: 'log-ph-2',
    salesId: 'sales-1',
    date: '2026-07-15',
    type: 'work',
    startTime: '10:50',
    endTime: '11:20',
    details: 'ประชุมประเมินกลางปี',
    callsCount: 0,
    status: 'completed'
  },
  {
    id: 'log-ph-3',
    salesId: 'sales-1',
    date: '2026-07-15',
    type: 'work',
    startTime: '14:30',
    endTime: '15:00',
    details: 'นัดสอนการใช้งานระบบ WG000595',
    callsCount: 0,
    status: 'completed'
  },
  {
    id: 'log-fr-1',
    salesId: 'sales-2',
    date: '2026-07-14',
    type: 'work',
    startTime: '09:00',
    endTime: '10:30',
    details: 'ตอบเพจ ตอบ ลค ที่ทักเข้ามา ในไลน์ ประชุมก่อนพรีเซ้น',
    callsCount: 0,
    status: 'completed'
  },
  {
    id: 'log-fr-2',
    salesId: 'sales-2',
    date: '2026-07-14',
    type: 'work',
    startTime: '10:30',
    endTime: '14:00',
    details: 'ประชุม',
    callsCount: 0,
    status: 'completed'
  },
  {
    id: 'log-fr-3',
    salesId: 'sales-2',
    date: '2026-07-14',
    type: 'work',
    startTime: '14:00',
    endTime: '15:00',
    details: 'ลค มี ปัญหาติดต่อเข้ามา',
    callsCount: 0,
    status: 'completed'
  },
  {
    id: 'log-fr-4',
    salesId: 'sales-2',
    date: '2026-07-14',
    type: 'work',
    startTime: '15:00',
    endTime: '16:15',
    details: 'ประชุม my',
    callsCount: 0,
    status: 'completed'
  }
];

// --- Helper Date Formatting Functions ---
const getThaiDateInfo = (dateStr: string) => {
  if (!dateStr) return { dayOfWeek: '', dateDisplay: '', isToday: false };
  const date = new Date(dateStr);
  const daysOfWeek = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  
  const dayOfWeek = daysOfWeek[date.getDay()];
  const dateNum = date.getDate();
  const monthName = months[date.getMonth()];
  const yearTh = date.getFullYear() + 543; // Buddhist Era Conversion

  // Check if truly today in system time
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const isToday = dateStr === todayStr;

  return {
    dayOfWeek,
    dateDisplay: `${dateNum} ${monthName} ${yearTh}`,
    isToday
  };
};

export default function App() {
  // --- Persistent States ---
  const [sales, setSales] = useState<SalesMember[]>(() => {
    const local = localStorage.getItem('sales_worklog_members');
    const parsed: SalesMember[] = local ? JSON.parse(local) : PRELOADED_SALES;
    return parsed.filter(s => s.id !== 'sales-3' && s.name !== 'Sm Somchai');
  });

  const [logs, setLogs] = useState<WorkLog[]>(() => {
    const local = localStorage.getItem('sales_worklog_items');
    const parsed: WorkLog[] = local ? JSON.parse(local) : PRELOADED_LOGS;
    return parsed.filter(log => log.salesId !== 'sales-3');
  });

  // Real-time Database Loading and Status States
  const [isSalesLoaded, setIsSalesLoaded] = useState<boolean>(false);
  const [isLogsLoaded, setIsLogsLoaded] = useState<boolean>(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const isFirestoreLoaded = isSalesLoaded && isLogsLoaded;

  // Theme support: 'cream' (from image) or 'dark' (from prompt "Elegant Dark")
  const [theme, setTheme] = useState<'cream' | 'dark'>(() => {
    const local = localStorage.getItem('sales_worklog_theme');
    return (local === 'cream' || local === 'dark') ? local : 'cream';
  });

  // Current selected sales
  const [selectedSalesId, setSelectedSalesId] = useState<string>(() => {
    const local = localStorage.getItem('sales_worklog_selected_sales_id');
    if (local) {
      const parsedSales = localStorage.getItem('sales_worklog_members');
      const salesList: SalesMember[] = parsedSales ? JSON.parse(parsedSales) : PRELOADED_SALES;
      if (salesList.some(s => s.id === local)) {
        return local;
      }
    }
    return sales.length > 0 ? sales[0].id : '';
  });

  // Auto-select first sales member when sales list loads or is modified
  useEffect(() => {
    if (sales.length > 0 && !selectedSalesId) {
      setSelectedSalesId(sales[0].id);
    }
  }, [sales, selectedSalesId]);

  // Date selection (Default to Wed June 24, 2026)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const local = localStorage.getItem('sales_worklog_selected_date');
    return local || '2026-06-24';
  });

  // Tab: 'daily' (รายวัน) vs 'team' (ภาพรวม & เปรียบเทียบทีม) vs 'analytics' (วิเคราะห์งาน)
  const [activeTab, setActiveTab] = useState<'daily' | 'team' | 'analytics'>('daily');

  // --- Analytics States & Calculations ---
  const [analyticsSalesId, setAnalyticsSalesId] = useState<string>('all');

  // Filter logs for selected sales member (or all)
  const filteredAnalyticsLogs = useMemo(() => {
    if (analyticsSalesId === 'all') {
      return logs;
    }
    return logs.filter(log => log.salesId === analyticsSalesId);
  }, [logs, analyticsSalesId]);

  // 1. Daily Stats (for selectedDate)
  const dailyStats = useMemo(() => {
    const dayLogs = filteredAnalyticsLogs.filter(log => log.date === selectedDate);
    const total = dayLogs.length;
    const work = dayLogs.filter(log => log.type === 'work').length;
    const kase = dayLogs.filter(log => log.type === 'case').length;
    const call = dayLogs.filter(log => log.type === 'call').length;
    return {
      total,
      work,
      case: kase,
      call,
      workPct: total > 0 ? Math.round((work / total) * 100) : 0,
      casePct: total > 0 ? Math.round((kase / total) * 100) : 0,
      callPct: total > 0 ? Math.round((call / total) * 100) : 0,
    };
  }, [filteredAnalyticsLogs, selectedDate]);

  // 2. Weekly Stats (last 7 days ending on selectedDate)
  const weeklyStats = useMemo(() => {
    const last7Days: string[] = [];
    const dateObj = new Date(selectedDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(dateObj);
      d.setDate(dateObj.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      last7Days.push(`${yyyy}-${mm}-${dd}`);
    }

    const weekLogs = filteredAnalyticsLogs.filter(log => last7Days.includes(log.date));
    const total = weekLogs.length;
    const work = weekLogs.filter(log => log.type === 'work').length;
    const kase = weekLogs.filter(log => log.type === 'case').length;
    const call = weekLogs.filter(log => log.type === 'call').length;
    return {
      total,
      work,
      case: kase,
      call,
      workPct: total > 0 ? Math.round((work / total) * 100) : 0,
      casePct: total > 0 ? Math.round((kase / total) * 100) : 0,
      callPct: total > 0 ? Math.round((call / total) * 100) : 0,
      datesRange: `${getThaiDateInfo(last7Days[6]).dateDisplay} - ${getThaiDateInfo(last7Days[0]).dateDisplay}`
    };
  }, [filteredAnalyticsLogs, selectedDate]);

  // 3. Monthly Stats (calendar month of selectedDate)
  const monthlyStats = useMemo(() => {
    const monthPrefix = selectedDate.substring(0, 7); // YYYY-MM
    const monthLogs = filteredAnalyticsLogs.filter(log => log.date.startsWith(monthPrefix));
    const total = monthLogs.length;
    const work = monthLogs.filter(log => log.type === 'work').length;
    const kase = monthLogs.filter(log => log.type === 'case').length;
    const call = monthLogs.filter(log => log.type === 'call').length;

    // Get Thai month name
    const dateObj = new Date(selectedDate);
    const monthsFull = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const monthName = monthsFull[dateObj.getMonth()];
    const yearTh = dateObj.getFullYear() + 543;

    return {
      total,
      work,
      case: kase,
      call,
      workPct: total > 0 ? Math.round((work / total) * 100) : 0,
      casePct: total > 0 ? Math.round((kase / total) * 100) : 0,
      callPct: total > 0 ? Math.round((call / total) * 100) : 0,
      monthName: `${monthName} ${yearTh}`
    };
  }, [filteredAnalyticsLogs, selectedDate]);

  // --- Form States for Adding New Record ---
  const [entryType, setEntryType] = useState<'work' | 'case' | 'call'>('work');
  const [timeStart, setTimeStart] = useState<string>('12:11');
  const [timeEnd, setTimeEnd] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [callsCount, setCallsCount] = useState<number>(0);
  const [caseStatus, setCaseStatus] = useState<'notstarted' | 'pending' | 'inprogress' | 'completed'>('completed');
  const [callResult, setCallResult] = useState<string>('connected'); // 'answered' (รับสาย) | 'connected' (ติดต่อได้) | 'unreachable' (ติดต่อไม่ได้)

  // --- Sales Management States ---
  const [showSalesModal, setShowSalesModal] = useState<boolean>(false);
  const [salesNameInput, setSalesNameInput] = useState<string>('');
  const [salesAvatarInput, setSalesAvatarInput] = useState<string>('');

  // Editing logic
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  // Alerts & Live Clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date('2026-06-24T23:46:53'));
  const [isOverdueExpanded, setIsOverdueExpanded] = useState<boolean>(true);

  // --- Google Sheets Integration States & Handlers ---
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportedSheetUrl, setExportedSheetUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showSheetsModal, setShowSheetsModal] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setGoogleUser(user);
      } else {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const handleExportToGoogleSheets = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportedSheetUrl(null);

    try {
      let currentToken = googleToken;

      // If no token, authenticate
      if (!currentToken) {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (!credential?.accessToken) {
          throw new Error('ไม่สามารถดึง Access Token จากบัญชี Google ได้ กรุณาลองใหม่อีกครั้งค่ะ');
        }
        currentToken = credential.accessToken;
        setGoogleToken(currentToken);
        setGoogleUser(result.user);
      }

      // Export to sheet
      const url = await createAndPopulateSpreadsheet(currentToken, sales, logs);
      setExportedSheetUrl(url);
    } catch (err: any) {
      console.error('Error exporting to Google Sheets:', err);
      // Clear token on 401/403/Auth errors
      if (err.message && (err.message.includes('401') || err.message.includes('403') || err.message.includes('auth') || err.message.includes('permission'))) {
        setGoogleToken(null);
      }
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOut(auth);
      setGoogleUser(null);
      setGoogleToken(null);
      setExportedSheetUrl(null);
      setExportError(null);
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const salesRef = useRef<SalesMember[]>(sales);
  const logsRef = useRef<WorkLog[]>(logs);

  useEffect(() => {
    salesRef.current = sales;
  }, [sales]);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  // --- Firebase Real-time Sync ---
  useEffect(() => {
    // 1. Listen to sales collection
    const unsubscribeSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const salesList: SalesMember[] = [];
      snapshot.forEach((docSnap) => {
        salesList.push(docSnap.data() as SalesMember);
      });
      if (salesList.length === 0) {
        const salesToUpload = salesRef.current.length > 0 ? salesRef.current : PRELOADED_SALES;
        salesToUpload.forEach(async (member) => {
          try {
            await setDoc(doc(db, 'sales', member.id), member);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `sales/${member.id}`);
            setFirestoreError(err instanceof Error ? err.message : String(err));
          }
        });
      } else {
        const filteredFirestoreSales = salesList.filter(
          s => s.id !== 'sales-3' && s.name !== 'Sm Somchai' && s.name.toLowerCase().trim() !== 'nook'
        );
        setSales(filteredFirestoreSales);

        // Actively delete any "nook" in DB if found
        const nooksInDb = salesList.filter(s => s.name.toLowerCase().trim() === 'nook');
        if (nooksInDb.length > 0) {
          nooksInDb.forEach(async (n) => {
            try {
              await deleteDoc(doc(db, 'sales', n.id));
              // Also delete associated logs of nook
              const nookLogs = logsRef.current.filter(log => log.salesId === n.id);
              nookLogs.forEach(async (l) => {
                await deleteDoc(doc(db, 'logs', l.id));
              });
            } catch (e) {
              console.warn('Failed to delete nook from db:', e);
            }
          });
        }
      }
      setIsSalesLoaded(true);
      setFirestoreError(null);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'sales');
      setFirestoreError(error.message);
      setIsSalesLoaded(true); // Fallback to local storage on error
    });

    // 2. Listen to logs collection
    const unsubscribeLogs = onSnapshot(collection(db, 'logs'), (snapshot) => {
      const logsList: WorkLog[] = [];
      snapshot.forEach((docSnap) => {
        logsList.push(docSnap.data() as WorkLog);
      });
      if (logsList.length === 0) {
        // If Firestore is empty, upload current local state logs (which preserves user's offline edits/creation)
        const logsToUpload = logsRef.current.length > 0 ? logsRef.current : PRELOADED_LOGS;
        logsToUpload.forEach(async (log) => {
          try {
            await setDoc(doc(db, 'logs', log.id), log);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `logs/${log.id}`);
            setFirestoreError(err instanceof Error ? err.message : String(err));
          }
        });
        setLogs(logsToUpload);
      } else {
        const filteredFirestoreLogs = logsList.filter(log => {
          if (log.salesId === 'sales-3') return false;
          const isNook = salesRef.current.some(s => s.id === log.salesId && s.name.toLowerCase().trim() === 'nook');
          return !isNook;
        });

        // Ensure the preloaded logs for Ph Phere and Fr Frame exist in the database with correct dates.
        // If not, write/update them in Firestore and merge/update them locally.
        const specialPreloadedLogs = PRELOADED_LOGS.filter(
          log => log.id.startsWith('log-ph-') || log.id.startsWith('log-fr-')
        );

        const logsToSeed: WorkLog[] = [];
        specialPreloadedLogs.forEach(pLog => {
          const existingLog = filteredFirestoreLogs.find(l => l.id === pLog.id);
          if (!existingLog || existingLog.date !== pLog.date || existingLog.details !== pLog.details) {
            logsToSeed.push(pLog);
          }
        });

        if (logsToSeed.length > 0) {
          logsToSeed.forEach(async (log) => {
            try {
              await setDoc(doc(db, 'logs', log.id), log);
            } catch (err) {
              console.error(`Failed to seed/update preloaded log ${log.id}:`, err);
            }
          });

          const updatedFirestoreLogs = filteredFirestoreLogs.map(fLog => {
            const pLog = logsToSeed.find(l => l.id === fLog.id);
            return pLog ? pLog : fLog;
          });

          const finalLogs = [...updatedFirestoreLogs];
          logsToSeed.forEach(pLog => {
            if (!finalLogs.some(l => l.id === pLog.id)) {
              finalLogs.unshift(pLog);
            }
          });

          setLogs(finalLogs);
        } else {
          setLogs(filteredFirestoreLogs);
        }
      }
      setIsLogsLoaded(true);
      setFirestoreError(null);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'logs');
      setFirestoreError(error.message);
      setIsLogsLoaded(true); // Fallback to local storage on error
    });

    return () => {
      unsubscribeSales();
      unsubscribeLogs();
    };
  }, []);

  // --- Sync storage ---
  useEffect(() => {
    localStorage.setItem('sales_worklog_members', JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem('sales_worklog_items', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    if (selectedSalesId) {
      localStorage.setItem('sales_worklog_selected_sales_id', selectedSalesId);
    }
  }, [selectedSalesId]);

  useEffect(() => {
    localStorage.setItem('sales_worklog_selected_date', selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    localStorage.setItem('sales_worklog_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Ensure selectedSalesId is always valid and synced with the sales list
  useEffect(() => {
    if (sales.length > 0) {
      const exists = sales.some(s => s.id === selectedSalesId);
      if (!exists) {
        setSelectedSalesId(sales[0].id);
      }
    } else {
      setSelectedSalesId('');
    }
  }, [sales, selectedSalesId]);

  // Keep a simulated clock going (advancing standard time)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(prev => new Date(prev.getTime() + 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Move date back and forth
  const changeDateByDays = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  // --- Handlers ---
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSalesId) {
      alert('กรุณาเลือกหรือเพิ่มพนักงานขายก่อนบันทึกข้อมูลค่ะ');
      return;
    }
    if (!details.trim()) {
      alert('กรุณากรอกรายละเอียดงานค่ะ');
      return;
    }

    if (editingLogId) {
      // Edit existing log
      const targetLog = logs.find(item => item.id === editingLogId);
      if (targetLog) {
        const updatedLog: WorkLog = {
          ...targetLog,
          type: entryType,
          startTime: timeStart || '--:--',
          endTime: timeEnd || '--:--',
          details,
          callsCount: entryType === 'call' ? callsCount : 0,
          status: caseStatus,
        };
        if (entryType === 'call') {
          updatedLog.callResult = callResult;
        } else {
          delete updatedLog.callResult;
        }
        // Update local state instantly so UI and localStorage update immediately
        setLogs(prev => prev.map(item => item.id === editingLogId ? updatedLog : item));
        try {
          await setDoc(doc(db, 'logs', editingLogId), updatedLog);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `logs/${editingLogId}`);
        }
      }
      setEditingLogId(null);
    } else {
      // Create new log
      const newLog: WorkLog = {
        id: `log-${Date.now()}`,
        salesId: selectedSalesId,
        date: selectedDate,
        type: entryType,
        startTime: timeStart || '--:--',
        endTime: timeEnd || '--:--',
        details,
        callsCount: entryType === 'call' ? callsCount : 0,
        status: caseStatus,
      };
      if (entryType === 'call') {
        newLog.callResult = callResult;
      }
      // Update local state instantly so UI and localStorage update immediately
      setLogs(prev => [newLog, ...prev]);
      try {
        await setDoc(doc(db, 'logs', newLog.id), newLog);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `logs/${newLog.id}`);
      }
    }

    // Reset inputs
    setDetails('');
    setTimeStart('12:11');
    setTimeEnd('');
    setCallsCount(0);
    setCaseStatus('completed');
    setCallResult('connected');
  };

  const startEditLog = (log: WorkLog) => {
    setEditingLogId(log.id);
    setEntryType(log.type);
    setTimeStart(log.startTime === '--:--' ? '' : log.startTime);
    setTimeEnd(log.endTime === '--:--' ? '' : log.endTime);
    setDetails(log.details);
    setCallsCount(log.callsCount);
    setCaseStatus(log.status);
    setCallResult(log.callResult || 'connected');
    // Smooth scroll to form
    const formElement = document.getElementById('log-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const deleteLog = async (id: string) => {
    if (confirm('คุณแน่ใจหรือไม่ที่จะลบรายการบันทึกนี้?')) {
      // Update local state instantly
      setLogs(prev => prev.filter(item => item.id !== id));
      try {
        await deleteDoc(doc(db, 'logs', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `logs/${id}`);
      }
      if (editingLogId === id) {
        setEditingLogId(null);
        setDetails('');
      }
    }
  };

  const handleDeleteSales = async (id: string, name: string) => {
    if (confirm(`คุณแน่ใจหรือไม่ที่จะลบพนักงานขาย "${name}" และรายการบันทึกของเขาทั้งหมด?`)) {
      setSales(prev => prev.filter(s => s.id !== id));
      setLogs(prev => prev.filter(log => log.salesId !== id));
      try {
        await deleteDoc(doc(db, 'sales', id));
        // Also delete associated logs from Firestore
        const associatedLogs = logsRef.current.filter(log => log.salesId === id);
        for (const log of associatedLogs) {
          await deleteDoc(doc(db, 'logs', log.id));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `sales/${id}`);
      }
    }
  };

  const markOverdueLogCompleted = async (logId: string) => {
    const targetLog = logs.find(item => item.id === logId);
    if (targetLog) {
      const updatedLog: WorkLog = { ...targetLog, status: 'completed' };
      setLogs(prev => prev.map(item => item.id === logId ? updatedLog : item));
      try {
        await setDoc(doc(db, 'logs', logId), updatedLog);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `logs/${logId}`);
      }
    }
  };

  const updateLogStatus = async (logId: string, status: 'notstarted' | 'pending' | 'inprogress' | 'completed') => {
    const targetLog = logs.find(item => item.id === logId);
    if (targetLog) {
      const updatedLog: WorkLog = { ...targetLog, status };
      setLogs(prev => prev.map(item => item.id === logId ? updatedLog : item));
      try {
        await setDoc(doc(db, 'logs', logId), updatedLog);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `logs/${logId}`);
      }
    }
  };

  const handleAddSales = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesNameInput.trim()) return;

    // Build initials
    let initials = salesNameInput.trim().split(' ').map(n => n[0]).join('').substring(0, 2);
    if (!initials) initials = salesNameInput.trim().substring(0, 2);

    const colors = [
      'bg-sky-500 text-white',
      'bg-emerald-500 text-white',
      'bg-rose-500 text-white',
      'bg-amber-500 text-white',
      'bg-indigo-500 text-white',
      'bg-purple-500 text-white',
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newSales: SalesMember = {
      id: `sales-${Date.now()}`,
      name: salesNameInput.trim(),
      avatarText: salesAvatarInput.trim() || initials,
      color: randomColor
    };

    // Update local state instantly so user can see/select salesperson immediately
    setSales(prev => [...prev, newSales]);
    setSelectedSalesId(newSales.id);

    try {
      await setDoc(doc(db, 'sales', newSales.id), newSales);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sales/${newSales.id}`);
    }
    setSalesNameInput('');
    setSalesAvatarInput('');
    setShowSalesModal(false);
  };

  const handleClearAllData = async () => {
    if (confirm('คุณแน่ใจว่าต้องการล้างข้อมูลบันทึกทั้งหมดและกลับไปใช้ข้อมูลเริ่มต้นใช่หรือไม่?')) {
      // Clear locally instantly
      setSales(PRELOADED_SALES);
      setLogs(PRELOADED_LOGS);
      setSelectedSalesId(PRELOADED_SALES[0].id);
      setSelectedDate('2026-06-24');
      setActiveTab('daily');

      try {
        const batch = writeBatch(db);
        sales.forEach(s => {
          batch.delete(doc(db, 'sales', s.id));
        });
        logs.forEach(l => {
          batch.delete(doc(db, 'logs', l.id));
        });
        await batch.commit();

        const seedBatch = writeBatch(db);
        PRELOADED_SALES.forEach(s => {
          seedBatch.set(doc(db, 'sales', s.id), s);
        });
        PRELOADED_LOGS.forEach(l => {
          seedBatch.set(doc(db, 'logs', l.id), l);
        });
        await seedBatch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'clear-all');
      }
    }
  };

  // --- Export and Import JSON ---
  const exportDataJSON = () => {
    const fullData = {
      sales,
      logs,
      version: '1.0.0',
      exportedAt: new Date().toISOString()
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sales-worklog-backup-${selectedDate}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const importDataJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.sales && parsed.logs) {
            const batch = writeBatch(db);
            parsed.sales.forEach((s: SalesMember) => {
              batch.set(doc(db, 'sales', s.id), s);
            });
            parsed.logs.forEach((l: WorkLog) => {
              batch.set(doc(db, 'logs', l.id), l);
            });
            await batch.commit();

            if (parsed.sales.length > 0) {
              setSelectedSalesId(parsed.sales[0].id);
            }
            alert('นำเข้าข้อมูลเรียบร้อยแล้วค่ะ!');
          } else {
            alert('รูปแบบไฟล์ข้อมูลไม่ถูกต้อง กรุณาอัปโหลดไฟล์สำรองข้อมูลของระบบนี้เท่านั้นค่ะ');
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'import-all');
        }
      };
    }
  };

  // --- Calculations for Statistics & Filters ---
  const filteredLogs = logs
    .filter(log => log.salesId === selectedSalesId && log.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const activeSales = sales.find(s => s.id === selectedSalesId);

  // Memoized overdue logs (incomplete tasks whose scheduled date is before selectedDate)
  const overdueLogs = useMemo(() => {
    return logs.filter(log => log.status !== 'completed' && log.date < selectedDate);
  }, [logs, selectedDate]);

  // Daily Counts for the current selected Sales and Date
  const dailyWorkCount = filteredLogs.filter(l => l.type === 'work').length;
  const dailyCaseCount = filteredLogs.filter(l => l.type === 'case').length;
  const dailyCallsCount = filteredLogs.reduce((acc, curr) => curr.type === 'call' || curr.callsCount > 0 ? acc + curr.callsCount : acc, 0);

  // Weekly calculations (Current week surrounding 2026-06-24)
  // Let's filter logs for the current week: Sunday June 21, 2026 to Saturday June 27, 2026
  const getWeekRange = () => {
    // We base on selectedDate
    const current = new Date(selectedDate);
    const day = current.getDay(); // 0 (Sun) to 6 (Sat)
    const sunday = new Date(current);
    sunday.setDate(current.getDate() - day);
    
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${dayNum}`);
    }
    return dates;
  };

  const weekDates = getWeekRange();
  const weeklyLogs = logs.filter(log => weekDates.includes(log.date));

  // Team summary data
  const totalWeeklyCalls = weeklyLogs.reduce((sum, curr) => sum + (curr.callsCount || 0), 0);
  const totalWeeklyCasesPending = logs.filter(l => l.type === 'case' && l.status !== 'completed').length;
  const totalWeeklyCasesSolved = logs.filter(l => l.type === 'case' && l.status === 'completed').length;

  // Group statistics per Sales for Leaderboard
  const salesLeaderboard = sales.map(s => {
    const sLogs = weeklyLogs.filter(l => l.salesId === s.id);
    const totalCalls = sLogs.reduce((sum, curr) => sum + (curr.callsCount || 0), 0);
    const totalTasks = sLogs.filter(l => l.type === 'work').length;
    const totalCases = sLogs.filter(l => l.type === 'case').length;
    const completedTasks = sLogs.filter(l => l.status === 'completed').length;
    return {
      sales: s,
      totalCalls,
      totalTasks,
      totalCases,
      completedTasks,
      totalActivity: sLogs.length
    };
  }).sort((a, b) => b.totalCalls - a.totalCalls); // Rank by phone calls first

  // Weekly target status
  const targetCalls = 60;
  const progressPercent = Math.min(100, Math.round((totalWeeklyCalls / targetCalls) * 100));

  // Date formatted for Weekly range display
  const firstDayTh = getThaiDateInfo(weekDates[0]).dateDisplay;
  const lastDayTh = getThaiDateInfo(weekDates[6]).dateDisplay;

  // --- Themes Variable Mapping ---
  const isCream = theme === 'cream';

  return (
    <div className={`min-h-screen transition-colors duration-300 font-sans ${
      isCream 
        ? 'bg-[#f7f5f0] text-stone-800' 
        : 'bg-slate-950 text-slate-100'
    }`}>
      
      {/* Primary Wrapper Container */}
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">

        {firestoreError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-600 dark:text-red-400 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
              <span>ตรวจพบปัญหาการเชื่อมต่อฐานข้อมูลคลาวด์: {firestoreError}</span>
            </span>
            <button 
              onClick={() => setFirestoreError(null)}
              className="text-red-500 hover:text-red-700 font-extrabold cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {/* UPPER HEADER CONTROLS */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-6 border-b border-stone-200/60 dark:border-slate-800">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight Thai-Font flex flex-wrap items-center gap-2">
              สมุดบันทึกงานประจำวัน
              {isFirestoreLoaded ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  เชื่อมต่อคลาวด์แล้ว
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  กำลังเชื่อมต่อข้อมูลคลาวด์...
                </span>
              )}
            </h1>
            <p className="text-xs md:text-sm text-stone-500 dark:text-slate-400 mt-1">
              บันทึกงาน • เคสที่ติด • การโทรหาลูกค้า • แยกตามเซลล์
            </p>
          </div>

          {/* Theme, Backup, and Reset Control Bar */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            
            {/* Backup / Restore Controls */}
            <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-slate-900 p-1 rounded-lg border border-stone-200 dark:border-slate-800">
              <button
                onClick={exportDataJSON}
                title="สำรองข้อมูลเป็นไฟล์ JSON"
                className="p-1.5 hover:bg-stone-200 dark:hover:bg-slate-800 rounded-md text-stone-600 dark:text-slate-300 transition"
              >
                <Download className="w-4 h-4" />
              </button>
              <label 
                title="นำเข้าไฟล์สำรองข้อมูล JSON"
                className="p-1.5 hover:bg-stone-200 dark:hover:bg-slate-800 rounded-md text-stone-600 dark:text-slate-300 cursor-pointer transition"
              >
                <Upload className="w-4 h-4" />
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={importDataJSON} 
                  className="hidden" 
                />
              </label>
            </div>

            {/* Google Sheets Export Button */}
            <button
              onClick={() => setShowSheetsModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-medium text-xs px-3 py-1.5 rounded-lg border border-emerald-500 shadow-sm transition"
              title="ส่งออกไปยัง Google Sheets"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden md:inline">ส่งออก Google Sheets</span>
            </button>

            {/* Toggle Theme Switcher (Beige/Cream vs. Elegant Dark) */}
            <div className="flex items-center bg-stone-100 dark:bg-slate-900 p-1 rounded-lg border border-stone-200 dark:border-slate-800">
              <button
                onClick={() => setTheme('cream')}
                className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1 transition ${
                  isCream 
                    ? 'bg-white text-stone-800 shadow-sm' 
                    : 'text-stone-500 hover:text-slate-200'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>วอร์มครีม 🍦</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1 transition ${
                  !isCream 
                    ? 'bg-slate-800 text-sky-400 shadow-sm' 
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>หรูดำเนียน 🌌</span>
              </button>
            </div>

            {/* Clear All Data */}
            <button
              id="btn-clear-data"
              onClick={handleClearAllData}
              className="px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition cursor-pointer"
            >
              ล้างข้อมูล
            </button>
          </div>
        </div>

        {/* OVERDUE ALERTS CARD */}
        {overdueLogs.length > 0 && (
          <div className={`p-5 rounded-2xl border mb-6 transition-all shadow-md ${
            isCream 
              ? 'bg-rose-50/70 border-rose-200 text-rose-900' 
              : 'bg-rose-950/20 border-rose-500/20 text-rose-300'
          }`}>
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsOverdueExpanded(!isOverdueExpanded)}>
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
                <span className="font-extrabold text-sm Thai-Font flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-rose-500 animate-bounce" />
                  <span>แจ้งเตือนงานค้างเกินกำหนด ({overdueLogs.length} รายการ)</span>
                </span>
              </div>
              <button className="text-xs font-bold underline text-rose-600 hover:text-rose-500 dark:text-rose-400 dark:hover:text-rose-300">
                {isOverdueExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดงานค้าง'}
              </button>
            </div>

            {isOverdueExpanded && (
              <div className="mt-4 space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {overdueLogs.map(log => {
                  const logSales = sales.find(s => s.id === log.salesId);
                  return (
                    <div 
                      key={log.id}
                      className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                        isCream 
                          ? 'bg-white border-stone-200/80 shadow-sm' 
                          : 'bg-slate-900/90 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Responsible Salesperson Tag */}
                        {logSales ? (
                          <span 
                            className={`px-2 py-1 rounded text-[10px] font-extrabold flex-shrink-0 ${logSales.color}`}
                            title={`รับผิดชอบโดย ${logSales.name}`}
                          >
                            {logSales.name}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-[10px] font-bold bg-stone-100 text-stone-500">
                            ไม่ระบุเซลล์
                          </span>
                        )}
                        <div>
                          <p className="font-semibold text-stone-800 dark:text-slate-200 leading-relaxed">
                            {log.details}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-stone-500 dark:text-slate-400 mt-1">
                            <span>กำหนดเดิม: {getThaiDateInfo(log.date).dateDisplay}</span>
                            <span>•</span>
                            <span className="capitalize font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                              {log.status === 'notstarted' ? 'ยังไม่ดำเนินการ' : log.status === 'pending' ? 'รอดำเนินการ' : 'กำลังทำ'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        <button
                          onClick={() => setSelectedDate(log.date)}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold border transition ${
                            isCream
                              ? 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                          }`}
                        >
                          ไปที่วันที่
                        </button>
                        <button
                          onClick={() => markOverdueLogCompleted(log.id)}
                          className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>ทำเสร็จแล้ว</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECTION: SALES SELECTOR & MANAGER */}
        <div className={`p-4 rounded-2xl border mb-6 transition-all ${
          isCream 
            ? 'bg-[#efede7] border-stone-200/80' 
            : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-slate-400">
              เลือกเซลล์ในการทำงาน
            </span>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setShowSalesModal(true)}
                className="text-teal-600 dark:text-sky-400 hover:underline font-semibold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> เพิ่มพนักงานเซลล์
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sales.map(s => {
              const isSelected = selectedSalesId === s.id;
              return (
                <button
                  key={s.id}
                  id={`sales-btn-${s.id}`}
                  onClick={() => {
                    setSelectedSalesId(s.id);
                    setEditingLogId(null);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition cursor-pointer group ${
                    isSelected
                      ? isCream
                        ? 'bg-stone-900 border-stone-900 text-white shadow-md'
                        : 'bg-sky-500/10 border-sky-400 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                      : isCream
                        ? 'bg-white hover:bg-stone-50 border-stone-300 text-stone-700'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${s.color}`}>
                    {s.avatarText}
                  </span>
                  <span>{s.name}</span>
                  {isSelected && <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />}
                  
                  {/* Hover Delete Button */}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSales(s.id, s.name);
                    }}
                    className="ml-1 p-0.5 rounded-full hover:bg-rose-500/20 text-stone-400 hover:text-rose-500 transition opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0 cursor-pointer"
                    title="ลบพนักงานขายท่านนี้"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => setShowSalesModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-dashed border-stone-400 dark:border-slate-700 text-xs font-semibold text-stone-600 dark:text-slate-400 hover:bg-stone-50 dark:hover:bg-slate-900 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มเซลล์</span>
            </button>
          </div>
        </div>

        {/* SALES MANAGE PANEL MODAL */}
        {showSalesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className={`w-full max-w-md p-6 rounded-2xl shadow-2xl border ${
              isCream ? 'bg-white border-stone-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">เพิ่มพนักงานเซลล์</h3>
                <button 
                  onClick={() => setShowSalesModal(false)}
                  className="p-1 hover:bg-stone-100 dark:hover:bg-slate-800 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddSales} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-500 dark:text-slate-400 mb-1">
                    ชื่อพนักงานขาย
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น คุณวรรณภา, Phere"
                    value={salesNameInput}
                    onChange={(e) => setSalesNameInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-500 dark:text-slate-400 mb-1">
                    ตัวย่ออวาตาร์ (2 ตัวอักษร)
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="เช่น Wn (ปล่อยว่างเพื่อดึงอัตโนมัติ)"
                    value={salesAvatarInput}
                    onChange={(e) => setSalesAvatarInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 animate-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSalesModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-stone-100 dark:bg-slate-800 hover:bg-stone-200"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 text-white shadow-md"
                  >
                    บันทึกเพิ่มเซลล์
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* GOOGLE SHEETS EXPORT MODAL */}
        {showSheetsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className={`w-full max-w-md p-6 rounded-2xl shadow-2xl border ${
              isCream ? 'bg-white border-stone-200 text-stone-800' : 'bg-slate-900 border-slate-800 text-white'
            }`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg Thai-Font flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <span>ส่งออกข้อมูลไปยัง Google Sheets</span>
                </h3>
                <button 
                  onClick={() => {
                    setShowSheetsModal(false);
                    setExportedSheetUrl(null);
                    setExportError(null);
                  }}
                  className="p-1 hover:bg-stone-100 dark:hover:bg-slate-800 rounded-full text-stone-500 dark:text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {googleUser ? (
                  <div className="p-3 bg-stone-50 dark:bg-slate-800/50 rounded-xl border border-stone-200/60 dark:border-slate-800/80">
                    <p className="text-xs text-stone-500 dark:text-slate-400">บัญชี Google ที่เชื่อมต่อ</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2">
                        {googleUser.photoURL ? (
                          <img 
                            src={googleUser.photoURL} 
                            alt={googleUser.displayName || 'Google User'} 
                            referrerPolicy="no-referrer"
                            className="w-6 h-6 rounded-full"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold animate-none">
                            G
                          </div>
                        )}
                        <span className="text-sm font-semibold truncate max-w-[180px]">
                          {googleUser.displayName || googleUser.email}
                        </span>
                      </div>
                      <button
                        onClick={handleGoogleSignOut}
                        className="text-xs text-red-600 hover:text-red-500 hover:underline transition font-medium cursor-pointer"
                      >
                        ออกจากระบบ
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 space-y-3">
                    <p className="text-sm text-stone-600 dark:text-slate-300">
                      กรุณาเข้าสู่ระบบด้วยบัญชี Google เพื่ออนุญาตการส่งออกและบันทึกข้อมูลรายงานของคุณลงใน Google Sheets
                    </p>
                    
                    {/* Official Sign in with Google Button */}
                    <button 
                      onClick={handleExportToGoogleSheets}
                      className="gsi-material-button mx-auto"
                      style={{
                        backgroundColor: 'white',
                        border: '1px solid #dadce0',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        color: '#3c4043',
                        cursor: 'pointer',
                        fontFamily: '"Roboto",arial,sans-serif',
                        fontSize: '14px',
                        height: '40px',
                        letterSpacing: '0.25px',
                        outline: 'none',
                        overflow: 'hidden',
                        padding: '0 12px',
                        position: 'relative',
                        textAlign: 'center',
                        transition: 'background-color .218s, border-color .218s, box-shadow .218s',
                        verticalAlign: 'middle',
                        whiteSpace: 'nowrap',
                        width: 'auto',
                        maxWidth: '400px',
                        minWidth: 'min-content',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px'
                      }}
                    >
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: '20px', height: '20px' }}>
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                      <span style={{ fontWeight: 500 }}>ลงชื่อเข้าใช้ด้วย Google</span>
                    </button>
                  </div>
                )}

                {isExporting ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-600 rounded-full animate-spin"></div>
                    <p className="text-sm font-medium text-stone-600 dark:text-slate-300 animate-pulse">
                      กำลังสร้างและเขียนข้อมูลลง Google Sheets...
                    </p>
                  </div>
                ) : (
                  googleUser && (
                    <div className="space-y-3 pt-2">
                      <button
                        onClick={handleExportToGoogleSheets}
                        className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg border border-emerald-500 flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <FileSpreadsheet className="w-5 h-5" />
                        <span>เริ่มส่งออกไปยัง Google Sheets</span>
                      </button>
                    </div>
                  )
                )}

                {exportedSheetUrl && (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 rounded-xl border border-emerald-200/50 dark:border-emerald-900/50 space-y-3 mt-2">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 mt-0.5 text-emerald-600 flex-shrink-0" />
                      <div>
                        <h4 className="font-bold text-sm">ส่งออกข้อมูลสำเร็จ!</h4>
                        <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                          ระบบได้ทำการสร้างรายงาน Excel Spreadsheet และอัปโหลดไฟล์ไปยัง Google Sheets ของคุณเรียบร้อยแล้วค่ะ
                        </p>
                      </div>
                    </div>
                    <a
                      href={exportedSheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-center text-white text-xs font-bold rounded-lg transition shadow-md"
                    >
                      เปิด Google Sheets ดูรายงาน ↗
                    </a>
                  </div>
                )}

                {exportError && (
                  <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-xl border border-red-200/50 dark:border-red-900/40 space-y-1.5 mt-2 text-xs">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span>เกิดข้อผิดพลาดในการส่งออก</span>
                    </div>
                    <p className="text-red-600/90 dark:text-red-400/80 leading-relaxed font-mono overflow-auto max-h-24 p-1 bg-black/5 dark:bg-black/20 rounded">
                      {exportError}
                    </p>
                    <p className="text-stone-500 dark:text-slate-400 mt-1">
                      คำแนะนำ: หากไม่สามารถเชื่อมต่อได้ กรุณากดออกจากระบบและลองกดลงชื่อเข้าใช้อีกครั้งเพื่อมอบสิทธิ์การเขียนไฟล์ Google Sheets ใหม่ค่ะ
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION: MAIN NAVIGATION TABS ("รายวัน", "ภาพรวม & เปรียบเทียบทีม", "วิเคราะห์ประสิทธิภาพ") */}
        <div className="grid grid-cols-3 bg-stone-200/50 dark:bg-slate-900 p-1.5 rounded-xl border border-stone-200 dark:border-slate-800/80 mb-6">
          <button
            onClick={() => setActiveTab('daily')}
            className={`py-3 text-[12px] md:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer ${
              activeTab === 'daily'
                ? isCream
                  ? 'bg-white text-stone-800 shadow'
                  : 'bg-slate-800 text-white border border-slate-700/50 shadow-md'
                : 'text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span>รายวัน</span>
          </button>
          
          <button
            onClick={() => setActiveTab('team')}
            className={`py-3 text-[12px] md:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer ${
              activeTab === 'team'
                ? isCream
                  ? 'bg-white text-stone-800 shadow'
                  : 'bg-slate-800 text-white border border-slate-700/50 shadow-md'
                : 'text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span>ภาพรวมทีม</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-3 text-[12px] md:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer ${
              activeTab === 'analytics'
                ? isCream
                  ? 'bg-white text-stone-800 shadow'
                  : 'bg-slate-800 text-white border border-slate-700/50 shadow-md'
                : 'text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200'
            }`}
          >
            <PieChart className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span>วิเคราะห์ผลงาน</span>
          </button>
        </div>

        {/* DATE SELECTOR NAVIGATOR BAR */}
        <div className="flex flex-col items-center gap-2.5 mb-8 max-w-xl mx-auto">
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => changeDateByDays(-1)}
              className={`p-2 rounded-lg border transition cursor-pointer ${
                isCream 
                  ? 'bg-white border-stone-200 hover:bg-stone-50 text-stone-700' 
                  : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300'
              }`}
              title="ย้อนกลับ 1 วัน"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-1">
                {getThaiDateInfo(selectedDate).dayOfWeek}
              </span>
              
              {/* Interactive Date Picker Display Wrapper */}
              <div 
                className={`relative inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl transition cursor-pointer group border ${
                  isCream
                    ? 'bg-white border-stone-200 hover:bg-stone-50 text-stone-800 shadow-sm'
                    : 'bg-slate-900 border-slate-800/80 hover:bg-slate-800/60 text-slate-100 shadow-md'
                }`}
                title="จิ้มเลือกวันที่ต้องการบันทึกข้อมูล"
              >
                {/* Native hidden date picker overlay on top */}
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  style={{ colorScheme: theme === 'dark' ? 'dark' : 'light' }}
                />
                
                <Calendar className="w-4 h-4 text-stone-500 dark:text-slate-400 group-hover:text-teal-600 dark:group-hover:text-sky-400 transition" />
                <h2 className="text-sm md:text-base font-extrabold tracking-tight group-hover:text-teal-600 dark:group-hover:text-sky-400 transition">
                  {getThaiDateInfo(selectedDate).dateDisplay}
                </h2>
                <ChevronDown className="w-3.5 h-3.5 text-stone-400 dark:text-slate-500 group-hover:text-teal-600 dark:group-hover:text-sky-400 transition" />
              </div>

              <p className="text-xs text-stone-500 dark:text-slate-400 mt-1.5 font-semibold">
                เซลล์: <span className="text-teal-600 dark:text-sky-400 underline">{activeSales?.name || 'ไม่มีเซลล์'}</span>
              </p>
            </div>

            <button
              onClick={() => changeDateByDays(1)}
              className={`p-2 rounded-lg border transition cursor-pointer ${
                isCream 
                  ? 'bg-white border-stone-200 hover:bg-stone-50 text-stone-700' 
                  : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300'
              }`}
              title="ถัดไป 1 วัน"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Date Jumper Shortcuts */}
          <div className="flex items-center gap-2 mt-1">
            {getThaiDateInfo(selectedDate).isToday ? (
              <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] px-2.5 py-1 rounded-full font-bold">
                วันนี้
              </span>
            ) : (
              <button
                onClick={() => {
                  const today = new Date();
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  setSelectedDate(todayStr);
                }}
                className={`text-[10px] px-2.5 py-1 rounded-full font-bold border transition cursor-pointer flex items-center gap-1 ${
                  isCream
                    ? 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white shadow-sm'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>กลับไปวันนี้</span>
              </button>
            )}

            {/* Jump to standard preloaded date (June 24, 2026) for easy testing / demo */}
            {selectedDate !== '2026-06-24' && (
              <button
                onClick={() => setSelectedDate('2026-06-24')}
                className={`text-[10px] px-2.5 py-1 rounded-full font-bold border transition cursor-pointer ${
                  isCream
                    ? 'bg-stone-100 border-stone-200 text-stone-600 hover:bg-stone-200'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
                title="กลับไปยังวันที่สาธิตข้อมูลเริ่มต้น"
              >
                ข้อมูลสาธิต (24 มิ.ย. 69)
              </button>
            )}
          </div>
        </div>


        {/* ==============================================
            TAB 1: DAILY ACTIVITY WORK LOG ("รายวัน")
            ============================================== */}
        {activeTab === 'daily' && (
          <div className="space-y-6">
            
            {/* COUNTER CARDS GRID (AS SHOWN IN MOCKUP) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Card 1: Work plan */}
              <div className={`p-5 rounded-2xl border transition-all ${
                isCream 
                  ? 'bg-white border-stone-200' 
                  : 'bg-slate-900 border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.15)]'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  <span className="text-xs font-bold text-stone-500 dark:text-slate-400">Work plan</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold font-mono">{dailyWorkCount}</span>
                  <span className="text-xs text-stone-400">รายการ</span>
                </div>
              </div>

              {/* Card 2: Unplan */}
              <div className={`p-5 rounded-2xl border transition-all ${
                isCream 
                  ? 'bg-white border-stone-200' 
                  : 'bg-slate-900 border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.15)]'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span className="text-xs font-bold text-stone-500 dark:text-slate-400">Unplan</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold font-mono text-amber-500">{dailyCaseCount}</span>
                  <span className="text-xs text-stone-400">รายการ</span>
                </div>
              </div>

              {/* Card 3: โทรหาลูกค้า */}
              <div className={`p-5 rounded-2xl border transition-all ${
                isCream 
                  ? 'bg-white border-stone-200' 
                  : 'bg-slate-900 border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.15)]'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-bold text-stone-500 dark:text-slate-400">โทรลูกค้า</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold font-mono text-emerald-500">{dailyCallsCount}</span>
                  <span className="text-xs text-stone-400">เจ้า</span>
                </div>
              </div>

            </div>

            {/* TWO-COLUMN GRID: INPUT FORM (LEFT) & DATA TABLE (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* COLUMN LEFT: INPUT FORM */}
              <div className="lg:col-span-1">
                <div id="log-form" className={`p-5 rounded-2xl border sticky top-6 ${
                  isCream 
                    ? 'bg-white border-stone-200 shadow-sm' 
                    : 'bg-slate-900 border-slate-800 shadow-xl'
                }`}>
                  <h3 className="text-sm font-bold uppercase tracking-wider mb-4 border-b pb-2 text-stone-500 dark:text-slate-300">
                    {editingLogId ? '📝 แก้ไขรายการบันทึก' : '➕ บันทึกข้อมูลวันนี้'}
                  </h3>

                  <form onSubmit={handleSaveRecord} className="space-y-4">
                    
                    {/* Switchable Record Types: งาน, ติดเคส, โทรลูกค้า (Like mockup) */}
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 dark:text-slate-400 mb-2 uppercase">
                        ประเภทรายการ
                      </label>
                      <div className="grid grid-cols-3 bg-stone-100 dark:bg-slate-950 p-1 rounded-lg border border-stone-200/80 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setEntryType('work')}
                          className={`py-1.5 text-xs font-bold rounded-md transition-all ${
                            entryType === 'work'
                              ? isCream
                                ? 'bg-stone-800 text-white'
                                : 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm'
                              : 'text-stone-500 hover:text-stone-700'
                          }`}
                        >
                          Work plan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryType('case')}
                          className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                            entryType === 'case'
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : 'text-stone-500 hover:text-stone-700'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Unplan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryType('call')}
                          className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                            entryType === 'call'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'text-stone-500 hover:text-stone-700'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          โทรลูกค้า
                        </button>
                      </div>
                    </div>

                    {/* Start Time ("เริ่ม") and End Time ("จบ") */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-500 dark:text-slate-400 mb-1">
                          เริ่ม
                        </label>
                        <div className="relative">
                          <input
                            type="time"
                            value={timeStart}
                            onChange={(e) => setTimeStart(e.target.value)}
                            className="w-full pl-3 pr-8 py-2 rounded-lg text-xs border border-stone-200 dark:border-slate-800 bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <Clock className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-stone-500 dark:text-slate-400 mb-1">
                          จบ
                        </label>
                        <div className="relative">
                          <input
                            type="time"
                            value={timeEnd}
                            onChange={(e) => setTimeEnd(e.target.value)}
                            placeholder="--:--"
                            className="w-full pl-3 pr-8 py-2 rounded-lg text-xs border border-stone-200 dark:border-slate-800 bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <Clock className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                        </div>
                      </div>
                    </div>

                    {/* Dynamic Option Input: Customer Phone Calls */}
                    {entryType === 'call' && (
                      <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 space-y-3.5">
                        <div>
                          <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                            จำนวนลูกค้าที่โทรติดต่อ (ราย/สาย)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={callsCount}
                            onChange={(e) => setCallsCount(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full px-3 py-1.5 rounded bg-transparent border border-emerald-300/30 text-sm focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 mb-1.5 uppercase">
                            ผลการติดต่อ
                          </label>
                          <div className="grid grid-cols-2 bg-stone-100 dark:bg-slate-950 p-1 rounded-md border border-stone-200/40 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => setCallResult('connected')}
                              className={`py-1 text-[10px] font-bold rounded cursor-pointer transition-all ${
                                callResult === 'connected' || callResult === 'answered'
                                  ? 'bg-emerald-500 text-white shadow-sm'
                                  : 'text-stone-500 hover:text-stone-700'
                              }`}
                            >
                              ติดต่อได้
                            </button>
                            <button
                              type="button"
                              onClick={() => setCallResult('unreachable')}
                              className={`py-1 text-[10px] font-bold rounded cursor-pointer transition-all ${
                                callResult === 'unreachable'
                                  ? 'bg-amber-500 text-white shadow-sm'
                                  : 'text-stone-500 hover:text-stone-700'
                              }`}
                            >
                              ติดต่อไม่ได้
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Option Input: Case Tracker details */}
                    {entryType === 'case' && (
                      <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 dark:text-slate-400 mb-1">
                            สถานะเคสเบื้องต้น
                          </label>
                          <select
                            value={caseStatus}
                            onChange={(e: any) => setCaseStatus(e.target.value)}
                            className="w-full px-2 py-1.5 rounded border text-xs bg-transparent border-amber-200/30 focus:outline-none"
                          >
                            <option value="notstarted" className="text-stone-800">ยังไม่ดำเนินการ</option>
                            <option value="pending" className="text-stone-800">รอดำเนินการ</option>
                            <option value="inprogress" className="text-stone-800">กำลังทำ</option>
                            <option value="completed" className="text-stone-800">สำเร็จแล้ว</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Status selection for generic Work / Tasks */}
                    {entryType === 'work' && (
                      <div>
                        <label className="block text-[11px] font-bold text-stone-500 dark:text-slate-400 mb-1">
                          สถานะงาน
                        </label>
                        <select
                          value={caseStatus}
                          onChange={(e: any) => setCaseStatus(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-xs bg-transparent border-stone-200 dark:border-slate-800 focus:outline-none"
                        >
                          <option value="completed" className="text-stone-800">สำเร็จ (Completed)</option>
                          <option value="inprogress" className="text-stone-800">กำลังทำ (In Progress)</option>
                          <option value="pending" className="text-stone-800">รอดำเนินการ (Pending)</option>
                          <option value="notstarted" className="text-stone-800">ยังไม่ดำเนินการ (Not Started)</option>
                        </select>
                      </div>
                    )}

                    {/* Details input */}
                    <div>
                      <label className="block text-[11px] font-bold text-stone-500 dark:text-slate-400 mb-1">
                        รายละเอียดงาน
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        placeholder="วันนี้ทำอะไรไปบ้าง..."
                        className="w-full p-3 rounded-lg border border-stone-200 dark:border-slate-800 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-stone-900 hover:bg-stone-800 text-white dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>{editingLogId ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</span>
                      </button>

                      {editingLogId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLogId(null);
                            setDetails('');
                            setTimeStart('12:11');
                            setTimeEnd('');
                            setCallsCount(0);
                            setCaseStatus('completed');
                          }}
                          className="p-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs text-stone-500"
                        >
                          ยกเลิก
                        </button>
                      )}
                    </div>

                  </form>
                </div>
              </div>

              {/* COLUMN RIGHT: DAILY ACTIVITY TABLE (2/3 SPAN) */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* DAILY TASKS LIST CARD */}
                <div className={`border rounded-2xl overflow-hidden ${
                  isCream 
                    ? 'bg-white border-stone-200 shadow-sm' 
                    : 'bg-slate-900 border-slate-800 shadow-xl'
                }`}>
                  <div className="p-4 border-b border-stone-100 dark:border-slate-800 flex justify-between items-center bg-stone-50 dark:bg-slate-900/40">
                    <h3 className={`text-sm font-extrabold uppercase tracking-wider ${
                      isCream ? 'text-black' : 'text-slate-300'
                    }`}>
                      รายการกิจกรรมวันนี้ของ {activeSales?.name || '-'}
                    </h3>
                    <span className="text-xs font-bold text-teal-600 dark:text-sky-400">
                      ยอดโทรวันวันนี้: {dailyCallsCount} สาย
                    </span>
                  </div>

                  {filteredLogs.length === 0 ? (
                    <div className="p-12 text-center text-stone-400 dark:text-slate-500">
                      <Briefcase className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">ไม่มีบันทึกข้อมูลสำหรับพนักงานท่านนี้ในวันที่เลือกค่ะ</p>
                      <p className="text-xs mt-1">กรอกข้อมูลทางด้านซ้ายเพื่อเพิ่มรายการแรกได้เลย!</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className={`text-[14px] border-b border-stone-200 dark:border-slate-800 bg-stone-100 dark:bg-slate-900/30 ${
                            isCream ? 'text-black font-extrabold' : 'text-slate-200 font-bold'
                          }`}>
                            <th className="px-4 py-3.5 font-extrabold">เวลา</th>
                            <th className="px-4 py-3.5 font-extrabold">รายละเอียดงาน</th>
                            <th className="px-4 py-3.5 font-extrabold">โทรหาลูกค้า</th>
                            <th className="px-4 py-3.5 font-extrabold text-right">สถานะ / จัดการ</th>
                          </tr>
                        </thead>
                        <tbody className="text-[10px] divide-y divide-stone-100 dark:divide-slate-800/50">
                          {filteredLogs.map(log => {
                            const isWork = log.type === 'work';
                            const isCase = log.type === 'case';
                            const isCall = log.type === 'call';
                            
                            return (
                              <tr 
                                key={log.id} 
                                className={`hover:bg-stone-50/80 dark:hover:bg-slate-800/30 transition-all ${
                                  isWork ? 'bg-blue-500/[0.02]' : isCase ? 'bg-amber-500/[0.03]' : isCall ? 'bg-emerald-500/[0.02]' : ''
                                }`}
                              >
                                <td className={`px-4 py-2 font-mono whitespace-nowrap font-bold text-[10px] ${
                                  isCream ? 'text-black' : 'text-slate-200'
                                }`}>
                                  {log.startTime} - {log.endTime || '--:--'}
                                </td>
                                
                                <td className="px-4 py-2">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {isWork && (
                                        <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[8.5px] px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                                          <Briefcase className="w-2.5 h-2.5" /> Work plan
                                        </span>
                                      )}
                                      {isCase && (
                                        <span className="bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[8.5px] px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                                          <AlertCircle className="w-2.5 h-2.5" /> Unplan
                                        </span>
                                      )}
                                      {isCall && (
                                        <>
                                          <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8.5px] px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                                            <Phone className="w-2.5 h-2.5" /> Call Log
                                          </span>
                                          {(log.callResult === 'connected' || log.callResult === 'answered' || !log.callResult) ? (
                                            <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[8.5px] px-1.5 py-0.5 rounded font-bold">
                                              ติดต่อได้
                                            </span>
                                          ) : (
                                            <span className="bg-amber-500/15 text-amber-600 dark:text-amber-500 text-[8.5px] px-1.5 py-0.5 rounded font-bold">
                                              ติดต่อไม่ได้
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                    <p className={`font-semibold text-[10.5px] leading-relaxed ${
                                      isCream ? 'text-black font-semibold' : 'text-white'
                                    }`}>
                                      {log.details}
                                    </p>
                                  </div>
                                </td>

                                <td className={`px-4 py-2 font-mono font-bold text-[10px] ${
                                  isCream ? 'text-black' : 'text-slate-200'
                                }`}>
                                  {log.callsCount > 0 ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{log.callsCount} ราย</span>
                                  ) : (
                                    <span className={isCream ? 'text-stone-400' : 'text-slate-600'}>-</span>
                                  )}
                                </td>

                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    {/* Task Status Dropdown */}
                                    <div className="relative">
                                      <select
                                        value={log.status}
                                        onChange={(e) => updateLogStatus(log.id, e.target.value as any)}
                                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400/50 hover:opacity-90 transition-all text-center appearance-none ${
                                          log.status === 'completed' 
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                            : log.status === 'inprogress'
                                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500 font-bold'
                                              : log.status === 'notstarted'
                                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold'
                                                : 'bg-stone-200/50 dark:bg-slate-800 text-black dark:text-slate-300'
                                        }`}
                                      >
                                        <option value="completed" className="text-stone-800 bg-stone-50 dark:bg-slate-900 font-bold">สำเร็จ</option>
                                        <option value="inprogress" className="text-stone-800 bg-stone-50 dark:bg-slate-900 font-bold">กำลังทำ</option>
                                        <option value="pending" className="text-stone-800 bg-stone-50 dark:bg-slate-900 font-bold">รอดำเนินการ</option>
                                        <option value="notstarted" className="text-stone-800 bg-stone-50 dark:bg-slate-900 font-bold">ยังไม่ดำเนินการ</option>
                                      </select>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => startEditLog(log)}
                                        title="แก้ไขบันทึก"
                                        className="p-1 hover:bg-stone-200 dark:hover:bg-slate-800 rounded text-stone-500 dark:text-slate-400 transition"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => deleteLog(log.id)}
                                        title="ลบบันทึก"
                                        className="p-1 hover:bg-rose-500/10 text-rose-500 rounded transition"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>
        )}

        {/* ==============================================
            TAB 2: TEAM OVERVIEW & COMPARISON ("ภาพรวม & เปรียบเทียบทีม")
            ============================================== */}
        {activeTab === 'team' && (
          <div className="space-y-6">

            {/* TEAM WEEKLY SUMMARY METRICS */}
            <div className={`p-6 rounded-2xl border ${
              isCream ? 'bg-white border-stone-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-xl'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
                <div>
                  <h3 className="text-base font-bold tracking-tight text-teal-600 dark:text-sky-400 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    <span>สรุปผลการปฏิบัติงานรายสัปดาห์ (Weekly Workspace Stats)</span>
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-slate-400 mt-0.5">
                    ช่วงสัปดาห์: {firstDayTh} ถึง {lastDayTh}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] text-stone-400 dark:text-slate-500 uppercase font-bold">
                    อัตราความคืบหน้าเป้าโทรสะสมของทีม ({totalWeeklyCalls} / {targetCalls} สาย)
                  </p>
                  <div className="flex items-center gap-2 mt-1 justify-end">
                    <div className="w-40 h-2 bg-stone-100 dark:bg-slate-800 rounded-full overflow-hidden border border-stone-200/50 dark:border-slate-700">
                      <div 
                        className="bg-emerald-500 h-full rounded-full transition-all duration-1000"
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-bold font-mono">{progressPercent}%</span>
                  </div>
                </div>
              </div>

              {/* THREE COLUMN STATS INFO */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. โทรสะสม */}
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-slate-950 border border-stone-200 dark:border-slate-800/80 text-center md:text-left">
                  <p className="text-xs text-stone-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                    ยอดโทรของทีมรวมสัปดาห์นี้
                  </p>
                  <p className="text-3xl font-extrabold font-mono text-emerald-500 mt-2">
                    {totalWeeklyCalls} <span className="text-sm font-normal text-stone-500">สาย</span>
                  </p>
                  <p className="text-[10px] text-stone-400 dark:text-slate-500 mt-1">
                    เป้าหมายของทีมคือ {targetCalls} สาย
                  </p>
                </div>

                {/* 2. เคสสะสม */}
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-slate-950 border border-stone-200 dark:border-slate-800/80 text-center md:text-left">
                  <p className="text-xs text-stone-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                    สถิติการเคลียร์ปัญหา (Unplan)
                  </p>
                  <div className="flex items-center justify-center md:justify-start gap-4 mt-2">
                    <div>
                      <p className="text-2xl font-extrabold font-mono text-amber-500">
                        {totalWeeklyCasesPending}
                      </p>
                      <p className="text-[9px] text-stone-400 dark:text-slate-500 font-bold">รอดำเนินการ</p>
                    </div>
                    <div className="h-8 border-r border-stone-200 dark:border-slate-800"></div>
                    <div>
                      <p className="text-2xl font-extrabold font-mono text-emerald-500">
                        {totalWeeklyCasesSolved}
                      </p>
                      <p className="text-[9px] text-stone-400 dark:text-slate-500 font-bold">แก้ไขสำเร็จ</p>
                    </div>
                  </div>
                </div>

                {/* 3. เซลล์เด่น */}
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-slate-950 border border-stone-200 dark:border-slate-800/80 flex flex-col justify-between">
                  <p className="text-xs text-stone-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                    🏆 เซลล์ยอดนักโทรสัปดาห์นี้
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-extrabold">
                      {salesLeaderboard[0]?.sales.avatarText || '-'}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-stone-800 dark:text-slate-200">
                        {salesLeaderboard[0]?.sales.name || 'ไม่มีผู้ปฏิบัติงาน'}
                      </p>
                      <p className="text-[10px] text-stone-400 dark:text-slate-500">
                        โทรติดต่อสะสมสูงสุด <span className="font-bold text-emerald-500">{salesLeaderboard[0]?.totalCalls || 0}</span> สาย
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* TWO-COLUMN GRID: TEAM COMPARISON CHART (LEFT) & LEADERBOARDS (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* COMPARISON BAR CHART (CUSTOM HIGH-FIDELITY INTERACTIVE SVG/TAILWIND) */}
              <div className="lg:col-span-2">
                <div className={`p-5 rounded-2xl border ${
                  isCream ? 'bg-white border-stone-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-xl'
                }`}>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    <span>เปรียบเทียบกิจกรรมระหว่างทีมเซลล์</span>
                  </h3>

                  {/* CUSTOM SVG CHART BUILD */}
                  <div className="space-y-6 pt-4">
                    {salesLeaderboard.map((leader, index) => {
                      const totalAct = leader.totalCalls + leader.totalTasks + leader.totalCases;
                      // Percentage mapping for layout rendering
                      const maxAct = Math.max(...salesLeaderboard.map(x => x.totalCalls + x.totalTasks + x.totalCases)) || 1;
                      const callPct = (leader.totalCalls / maxAct) * 100;
                      const taskPct = (leader.totalTasks / maxAct) * 100;
                      const casePct = (leader.totalCases / maxAct) * 100;

                      return (
                        <div key={leader.sales.id} className="space-y-2">
                          <div className="flex justify-between text-xs font-semibold">
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${leader.sales.color}`}>
                                {leader.sales.avatarText}
                              </span>
                              <span>{leader.sales.name}</span>
                            </div>
                            <span className="font-mono text-stone-500 dark:text-slate-400">
                              กิจกรรมสะสม: {totalAct} รายการ
                            </span>
                          </div>

                          {/* Split-colored horizontal segment charts */}
                          <div className="h-6 w-full bg-stone-100 dark:bg-slate-950 rounded-lg overflow-hidden flex relative border border-stone-200/40 dark:border-slate-800">
                            {/* Calls Segment */}
                            {leader.totalCalls > 0 && (
                              <div 
                                className="bg-emerald-500 hover:opacity-90 transition-all flex items-center justify-center text-[9px] text-white font-bold"
                                style={{ width: `${Math.max(8, callPct)}%` }}
                                title={`ยอดโทร: ${leader.totalCalls} สาย`}
                              >
                                📞 {leader.totalCalls}
                              </div>
                            )}

                            {/* Tasks Segment */}
                            {leader.totalTasks > 0 && (
                              <div 
                                className="bg-sky-500 hover:opacity-90 transition-all flex items-center justify-center text-[9px] text-white font-bold"
                                style={{ width: `${Math.max(8, taskPct)}%` }}
                                title={`Work plan: ${leader.totalTasks} รายการ`}
                              >
                                💼 {leader.totalTasks}
                              </div>
                            )}

                            {/* Cases Segment */}
                            {leader.totalCases > 0 && (
                              <div 
                                className="bg-amber-500 hover:opacity-90 transition-all flex items-center justify-center text-[9px] text-white font-bold"
                                style={{ width: `${Math.max(8, casePct)}%` }}
                                title={`Unplan: ${leader.totalCases} รายการ`}
                              >
                                ⚠️ {leader.totalCases}
                              </div>
                            )}

                            {totalAct === 0 && (
                              <div className="w-full flex items-center justify-center text-[10px] text-stone-400 dark:text-slate-600 italic">
                                ยังไม่มีกิจกรรมในสัปดาห์นี้
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Chart Legenda */}
                  <div className="mt-6 pt-4 border-t border-stone-100 dark:border-slate-800/80 flex items-center gap-4 text-[10px] text-stone-400 dark:text-slate-500 justify-center">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>
                      <span>ยอดโทรหาลูกค้า</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-sky-500"></span>
                      <span>Work plan</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-amber-500"></span>
                      <span>Unplan</span>
                    </div>
                  </div>

                </div>
              </div>

              {/* LEADERBOARD DETAILS COLUMN */}
              <div className="lg:col-span-1">
                <div className={`p-5 rounded-2xl border h-full ${
                  isCream ? 'bg-white border-stone-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-xl'
                }`}>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-600 dark:text-slate-300 mb-4 border-b pb-2">
                    อันดับความแอคทีฟทีม
                  </h3>

                  <div className="space-y-4">
                    {salesLeaderboard.map((item, index) => (
                      <div 
                        key={item.sales.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-slate-950 border border-stone-100 dark:border-slate-800/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-extrabold text-stone-400 dark:text-slate-500">
                            #{index + 1}
                          </span>
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${item.sales.color}`}>
                            {item.sales.avatarText}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-stone-800 dark:text-slate-200">
                              {item.sales.name}
                            </p>
                            <p className="text-[9px] text-stone-400 dark:text-slate-500">
                              โทรสะสม {item.totalCalls} สาย • จัดการ Unplan {item.totalCases}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-500 block">
                            {item.totalActivity} กิจกรรม
                          </span>
                          <span className="text-[9px] text-stone-400 dark:text-slate-500 block">
                            สัปดาห์นี้
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ==============================================
            TAB 3: EFFICIENCY & ACTIVITY RATIO ANALYSIS ("วิเคราะห์ผลงาน")
            ============================================== */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* ANALYTICS HEADER & FILTER CARD */}
            <div className={`p-6 rounded-2xl border ${
              isCream ? 'bg-white border-stone-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-xl'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-teal-600 dark:text-sky-400 flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-teal-500" />
                    <span>วิเคราะห์สัดส่วนงาน (Activity Proportion Analysis)</span>
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-slate-400 mt-1 font-semibold">
                    วิเคราะห์เปรียบเทียบสัดส่วนระหว่าง Work plan, Unplan และจำนวนการโทรหาลูกค้า
                  </p>
                </div>

                {/* Sales Selector */}
                <div className="flex items-center gap-2.5">
                  <label className="text-xs font-bold text-stone-600 dark:text-slate-300 whitespace-nowrap">
                    เลือกผู้ใช้:
                  </label>
                  <select
                    value={analyticsSalesId}
                    onChange={(e) => setAnalyticsSalesId(e.target.value)}
                    className={`text-xs font-bold px-3 py-2 rounded-lg border outline-none cursor-pointer ${
                      isCream 
                        ? 'bg-stone-50 border-stone-200 text-stone-800 focus:border-stone-400' 
                        : 'bg-slate-900 border-slate-800 text-slate-200 focus:border-slate-700'
                    }`}
                  >
                    <option value="all">ทุกคนในทีม (รวมภาพรวมทั้งหมด)</option>
                    {sales.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* GRID LAYOUT: DAILY, WEEKLY, MONTHLY CARDS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* 1. Daily Analytics Card */}
              <div className={`p-6 rounded-2xl border transition-all duration-300 ${
                isCream 
                  ? 'bg-white border-stone-200 hover:shadow-md' 
                  : 'bg-slate-900 border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:border-slate-700/50'
              }`}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-100 dark:border-slate-800/60">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-sky-500/10 text-sky-500">
                      <Clock className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold tracking-tight">รายวัน (Daily)</h3>
                      <p className="text-[10px] text-stone-400 dark:text-slate-500 font-bold uppercase">
                        {getThaiDateInfo(selectedDate).dateDisplay}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black tracking-tight text-teal-600 dark:text-sky-400 font-mono">
                      {dailyStats.total}
                    </span>
                    <span className="text-[9px] block text-stone-400 dark:text-slate-500 font-bold">กิจกรรมวันนี้</span>
                  </div>
                </div>

                {dailyStats.total === 0 ? (
                  <div className="py-16 text-center text-stone-400 dark:text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-35 text-stone-300" />
                    <p className="text-xs font-semibold">ไม่มีบันทึกข้อมูลสำหรับวันนี้</p>
                  </div>
                ) : (
                  <div className="space-y-5 mt-4">
                    {/* Work Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                          Work plan
                        </span>
                        <span className={isCream ? 'text-stone-800' : 'text-slate-100'}>
                          {dailyStats.workPct}% <span className="text-[10px] text-stone-400 dark:text-slate-500 font-medium">({dailyStats.work} รายการ)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-stone-100 dark:bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-500"
                          style={{ width: `${dailyStats.workPct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Case Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                          Unplan
                        </span>
                        <span className={isCream ? 'text-stone-800' : 'text-slate-100'}>
                          {dailyStats.casePct}% <span className="text-[10px] text-stone-400 dark:text-slate-500 font-medium">({dailyStats.case} รายการ)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-stone-100 dark:bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                          style={{ width: `${dailyStats.casePct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Call Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                          โทรหาลูกค้า
                        </span>
                        <span className={isCream ? 'text-stone-800' : 'text-slate-100'}>
                          {dailyStats.callPct}% <span className="text-[10px] text-stone-400 dark:text-slate-500 font-medium">({dailyStats.call} รายการ)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-stone-100 dark:bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                          style={{ width: `${dailyStats.callPct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Insight Box */}
                    <div className={`mt-4 p-3 rounded-xl border text-[11px] font-bold flex items-center gap-2 ${
                      isCream 
                        ? 'bg-stone-50 border-stone-200/60 text-stone-700' 
                        : 'bg-slate-950/40 border-slate-800 text-slate-300'
                    }`}>
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span>
                        {dailyStats.workPct === 0 && dailyStats.casePct === 0 && dailyStats.callPct === 0
                          ? 'ไม่มีข้อมูลกิจกรรมในช่วงเวลานี้'
                          : Math.max(dailyStats.workPct, dailyStats.casePct, dailyStats.callPct) === dailyStats.callPct
                            ? `เน้นการติดต่อลูกค้าทางโทรศัพท์เป็นหลัก (${dailyStats.callPct}%)`
                            : Math.max(dailyStats.workPct, dailyStats.casePct, dailyStats.callPct) === dailyStats.casePct
                              ? `เน้นการแก้ไขปัญหาและติดตามงาน Unplan (${dailyStats.casePct}%)`
                              : `เน้นการทำกิจกรรมตาม Work plan (${dailyStats.workPct}%)`
                        }
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Weekly Analytics Card */}
              <div className={`p-6 rounded-2xl border transition-all duration-300 ${
                isCream 
                  ? 'bg-white border-stone-200 hover:shadow-md' 
                  : 'bg-slate-900 border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:border-slate-700/50'
              }`}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-100 dark:border-slate-800/60">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                      <Calendar className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold tracking-tight">รายสัปดาห์ (Weekly)</h3>
                      <p className="text-[9px] text-stone-400 dark:text-slate-500 font-bold truncate max-w-[150px]">
                        {weeklyStats.datesRange}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black tracking-tight text-teal-600 dark:text-sky-400">
                      {weeklyStats.total}
                    </span>
                    <span className="text-[9px] block text-stone-400 dark:text-slate-500 font-bold">กิจกรรมสะสม</span>
                  </div>
                </div>

                {weeklyStats.total === 0 ? (
                  <div className="py-16 text-center text-stone-400 dark:text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-35 text-stone-300" />
                    <p className="text-xs font-semibold">ไม่มีบันทึกข้อมูลสำหรับสัปดาห์นี้</p>
                  </div>
                ) : (
                  <div className="space-y-5 mt-4">
                    {/* Work Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                          Work plan
                        </span>
                        <span className={isCream ? 'text-stone-800' : 'text-slate-100'}>
                          {weeklyStats.workPct}% <span className="text-[10px] text-stone-400 dark:text-slate-500 font-medium">({weeklyStats.work} รายการ)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-stone-100 dark:bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-500"
                          style={{ width: `${weeklyStats.workPct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Case Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                          Unplan
                        </span>
                        <span className={isCream ? 'text-stone-800' : 'text-slate-100'}>
                          {weeklyStats.casePct}% <span className="text-[10px] text-stone-400 dark:text-slate-500 font-medium">({weeklyStats.case} รายการ)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-stone-100 dark:bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                          style={{ width: `${weeklyStats.casePct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Call Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                          โทรหาลูกค้า
                        </span>
                        <span className={isCream ? 'text-stone-800' : 'text-slate-100'}>
                          {weeklyStats.callPct}% <span className="text-[10px] text-stone-400 dark:text-slate-500 font-medium">({weeklyStats.call} รายการ)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-stone-100 dark:bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                          style={{ width: `${weeklyStats.callPct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Insight Box */}
                    <div className={`mt-4 p-3 rounded-xl border text-[11px] font-bold flex items-center gap-2 ${
                      isCream 
                        ? 'bg-stone-50 border-stone-200/60 text-stone-700' 
                        : 'bg-slate-955/40 border-slate-800 text-slate-300'
                    }`}>
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span>
                        {weeklyStats.workPct === 0 && weeklyStats.casePct === 0 && weeklyStats.callPct === 0
                          ? 'ไม่มีข้อมูลกิจกรรมในช่วงเวลานี้'
                          : Math.max(weeklyStats.workPct, weeklyStats.casePct, weeklyStats.callPct) === weeklyStats.callPct
                            ? `เน้นการติดต่อลูกค้าทางโทรศัพท์เป็นหลัก (${weeklyStats.callPct}%)`
                            : Math.max(weeklyStats.workPct, weeklyStats.casePct, weeklyStats.callPct) === weeklyStats.casePct
                              ? `เน้นการแก้ไขปัญหาและติดตามงาน Unplan (${weeklyStats.casePct}%)`
                              : `เน้นการทำกิจกรรมตาม Work plan (${weeklyStats.workPct}%)`
                        }
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Monthly Analytics Card */}
              <div className={`p-6 rounded-2xl border transition-all duration-300 ${
                isCream 
                  ? 'bg-white border-stone-200 hover:shadow-md' 
                  : 'bg-slate-900 border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:border-slate-700/50'
              }`}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-100 dark:border-slate-800/60">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                      <BarChart3 className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold tracking-tight">รายเดือน (Monthly)</h3>
                      <p className="text-[10px] text-stone-400 dark:text-slate-500 font-bold uppercase">
                        {monthlyStats.monthName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black tracking-tight text-teal-600 dark:text-sky-400">
                      {monthlyStats.total}
                    </span>
                    <span className="text-[9px] block text-stone-400 dark:text-slate-500 font-bold">กิจกรรมสะสม</span>
                  </div>
                </div>

                {monthlyStats.total === 0 ? (
                  <div className="py-16 text-center text-stone-400 dark:text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-35 text-stone-300" />
                    <p className="text-xs font-semibold">ไม่มีบันทึกข้อมูลสำหรับเดือนนี้</p>
                  </div>
                ) : (
                  <div className="space-y-5 mt-4">
                    {/* Work Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                          Work plan
                        </span>
                        <span className={isCream ? 'text-stone-800' : 'text-slate-100'}>
                          {monthlyStats.workPct}% <span className="text-[10px] text-stone-400 dark:text-slate-500 font-medium">({monthlyStats.work} รายการ)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-stone-100 dark:bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-500"
                          style={{ width: `${monthlyStats.workPct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Case Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                          Unplan
                        </span>
                        <span className={isCream ? 'text-stone-800' : 'text-slate-100'}>
                          {monthlyStats.casePct}% <span className="text-[10px] text-stone-400 dark:text-slate-500 font-medium">({monthlyStats.case} รายการ)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-stone-100 dark:bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                          style={{ width: `${monthlyStats.casePct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Call Progress */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                          โทรหาลูกค้า
                        </span>
                        <span className={isCream ? 'text-stone-800' : 'text-slate-100'}>
                          {monthlyStats.callPct}% <span className="text-[10px] text-stone-400 dark:text-slate-500 font-medium">({monthlyStats.call} รายการ)</span>
                        </span>
                      </div>
                      <div className="w-full h-3 rounded-full bg-stone-100 dark:bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                          style={{ width: `${monthlyStats.callPct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Insight Box */}
                    <div className={`mt-4 p-3 rounded-xl border text-[11px] font-bold flex items-center gap-2 ${
                      isCream 
                        ? 'bg-stone-50 border-stone-200/60 text-stone-700' 
                        : 'bg-slate-955/40 border-slate-800 text-slate-300'
                    }`}>
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span>
                        {monthlyStats.workPct === 0 && monthlyStats.casePct === 0 && monthlyStats.callPct === 0
                          ? 'ไม่มีข้อมูลกิจกรรมในช่วงเวลานี้'
                          : Math.max(monthlyStats.workPct, monthlyStats.casePct, monthlyStats.callPct) === monthlyStats.callPct
                            ? `เน้นการติดต่อลูกค้าทางโทรศัพท์เป็นหลัก (${monthlyStats.callPct}%)`
                            : Math.max(monthlyStats.workPct, monthlyStats.casePct, monthlyStats.callPct) === monthlyStats.casePct
                              ? `เน้นการแก้ไขปัญหาและติดตามงาน Unplan (${monthlyStats.casePct}%)`
                              : `เน้นการทำกิจกรรมตาม Work plan (${monthlyStats.workPct}%)`
                        }
                      </span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* BOTTOM REAL-TIME LOGS SUMMARY BOARD */}
        <div className={`mt-8 p-4 rounded-xl text-center border ${
          isCream 
            ? 'bg-[#efede7] border-stone-200/60 text-stone-500' 
            : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
        } text-xs`}>
          <p className="font-semibold flex items-center justify-center gap-1.5">
            <span>● ระบบฐานข้อมูลทำงานปกติ (Local Persistent Storage)</span>
            <span>•</span>
            <span>เวลาจำลองระบบ: {currentTime.toLocaleTimeString('th-TH')} น.</span>
          </p>
        </div>

      </div>
    </div>
  );
}
