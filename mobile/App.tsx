import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const LOGIN_HERO_IMAGE = require('./assets/rsr-login-hero.jpg');

type Role = 'admin' | 'member';
type User = { id: number; name: string; email: string; role: Role; phone?: string };
type Member = { id: number; name: string; email: string; phone?: string; status: string; plan_name?: string; membership_end?: string };
type FitnessClass = { id: number; title: string; category: string; startsAt: string; durationMinutes: number; capacity: number; booked: number; room: string; trainer?: string };
type Booking = { id: number; class_id: number; title: string; category: string; startsAt: string; room: string; status: string };
type Plan = { id: number; name: string; price: number; durationDays: number; description: string };
type Payment = { id: number; name?: string; amount: number; currency: string; status: string; paidAt?: string };
type Dashboard = { members?: number; upcomingClasses?: number; checkInsToday?: number; monthlyRevenue?: number; visitsThisMonth?: number; upcomingBookings?: number };
type Tab = 'home' | 'members' | 'classes' | 'billing' | 'progress' | 'account' | 'attendance';

const CLOUDFLARE_URL = 'https://apnic-harris-jim-dash.trycloudflare.com/api';
const LOCAL_WIFI_URL = 'http://192.168.1.10:4000/api';
const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL || CLOUDFLARE_URL;

const COLORS = {
  navy: '#0B1B3D',
  primaryBlue: '#1D68FE',
  ink: '#1E293B',
  muted: '#64748B',
  canvas: '#F4F7FB',
  paper: '#FFFFFF',
  line: '#E2E8F0',
};

const initialMembers: Member[] = [
  { id: 12, name: 'Maya Chen', email: 'maya.chen@email.com', phone: '+91 98765 43210', status: 'active', plan_name: 'Unlimited', membership_end: '2026-10-22' },
  { id: 13, name: 'Theo James', email: 'theo.james@email.com', phone: '+91 98765 43211', status: 'active', plan_name: 'Essential', membership_end: '2026-10-04' },
  { id: 14, name: 'Nia Patel', email: 'nia.patel@email.com', phone: '+91 98765 43212', status: 'active', plan_name: 'Annual', membership_end: '2027-04-12' },
  { id: 15, name: 'Leo Grant', email: 'leo.grant@email.com', phone: '+91 98765 43213', status: 'inactive', plan_name: 'Essential', membership_end: '2026-08-30' },
];

const initialClasses: FitnessClass[] = [
  { id: 21, title: 'Strength circuit', category: 'Strength', startsAt: '2026-09-29T07:30:00', durationMinutes: 50, capacity: 16, booked: 11, room: 'Studio A', trainer: 'Sam Rivera' },
  { id: 22, title: 'Flow & mobility', category: 'Recovery', startsAt: '2026-09-29T12:15:00', durationMinutes: 45, capacity: 18, booked: 8, room: 'Studio B', trainer: 'Sam Rivera' },
  { id: 23, title: 'Engine room', category: 'Conditioning', startsAt: '2026-09-30T18:00:00', durationMinutes: 45, capacity: 14, booked: 12, room: 'Training floor', trainer: 'Jordan Lee' },
];

const initialPlans: Plan[] = [
  { id: 1, name: 'Essential', price: 1499, durationDays: 30, description: 'Full gym access, any time.' },
  { id: 2, name: 'Unlimited', price: 2499, durationDays: 30, description: 'Gym access plus unlimited classes.' },
  { id: 3, name: 'Annual', price: 19999, durationDays: 365, description: 'A full year of training, best value.' },
];

async function apiRequest<T>(base: string, path: string, token: string, options: RequestInit = {}): Promise<T> {
  const url = `${base.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP error ${response.status}`);
  return payload as T;
}

function dateLabel(value: string) {
  const date = new Date(value.replace(' ', 'T'));
  return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(value: string) {
  const date = new Date(value.replace(' ', 'T'));
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [showServerModal, setShowServerModal] = useState(false);
  const [customServerInput, setCustomServerInput] = useState(DEFAULT_API_URL);

  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  const [role, setRole] = useState<Role>('admin');
  const [email, setEmail] = useState('admin@forgegym.com');
  const [password, setPassword] = useState('gym1234');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [tab, setTab] = useState<Tab>('home');
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [classes, setClasses] = useState<FitnessClass[]>(initialClasses);
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [modal, setModal] = useState<'member' | 'class' | 'payment' | null>(null);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState(1);
  const [classTitle, setClassTitle] = useState('');
  const [classCategory, setClassCategory] = useState('Strength');
  const [paymentEmail, setPaymentEmail] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');

  // Test Server Connection
  async function testServer(urlToTest: string): Promise<boolean> {
    try {
      const res = await fetch(`${urlToTest.replace(/\/$/, '')}/health`, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' },
      });
      const data = await res.json().catch(() => ({}));
      return res.ok && data.status === 'ok';
    } catch {
      return false;
    }
  }

  // Initial check on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setServerStatus('checking');
      let ok = await testServer(apiUrl);
      if (!ok && apiUrl !== LOCAL_WIFI_URL) {
        // try local wifi as fallback
        const wifiOk = await testServer(LOCAL_WIFI_URL);
        if (wifiOk) {
          if (isMounted) {
            setApiUrl(LOCAL_WIFI_URL);
            setCustomServerInput(LOCAL_WIFI_URL);
            setServerStatus('connected');
          }
          return;
        }
      }
      if (isMounted) {
        setServerStatus(ok ? 'connected' : 'offline');
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [apiUrl]);

  // Connect and synchronize with live backend, clearing demo mode
  async function connectAndSync(targetUrl = apiUrl, showAlert = true): Promise<boolean> {
    setBusy(true);
    try {
      const loginEmail = user?.email || (role === 'admin' ? 'admin@forgegym.com' : 'member@forgegym.com');
      const res = await fetch(`${targetUrl.replace(/\/$/, '')}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
        body: JSON.stringify({ email: loginEmail, password: 'gym1234' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Server responded without authorization token');
      }

      setApiUrl(targetUrl);
      setCustomServerInput(targetUrl);
      setUser(data.user);
      setToken(data.token);
      setDemoMode(false);
      setServerStatus('connected');
      setNotice('');
      await fetchAllData(data.token, targetUrl);
      if (showAlert) {
        Alert.alert('✅ Connected to MySQL Database!', `Successfully connected to live backend:\n${targetUrl}\n\nOffline mode disabled. Member list is now live!`);
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (showAlert) {
        Alert.alert(
          'Connection Notice',
          `Could not connect to ${targetUrl}:\n${msg}\n\nWould you like to open server settings to choose another preset?`,
          [
            { text: 'Server Settings', onPress: () => setShowServerModal(true) },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Sync data from database
  async function fetchAllData(currentToken = token, currentBase = apiUrl) {
    if (!currentToken) return;
    try {
      const [dashRes, memRes, clsRes, plnRes, bkgRes, payRes] = await Promise.allSettled([
        apiRequest<Dashboard>(currentBase, '/dashboard', currentToken),
        apiRequest<Member[]>(currentBase, '/members', currentToken),
        apiRequest<FitnessClass[]>(currentBase, '/classes', currentToken),
        apiRequest<Plan[]>(currentBase, '/plans', currentToken),
        apiRequest<Booking[]>(currentBase, '/bookings', currentToken),
        apiRequest<Payment[]>(currentBase, '/payments', currentToken),
      ]);

      if (dashRes.status === 'fulfilled') setDashboard(dashRes.value);
      if (memRes.status === 'fulfilled' && Array.isArray(memRes.value)) setMembers(memRes.value);
      if (clsRes.status === 'fulfilled' && Array.isArray(clsRes.value)) setClasses(clsRes.value);
      if (plnRes.status === 'fulfilled' && Array.isArray(plnRes.value)) setPlans(plnRes.value);
      if (bkgRes.status === 'fulfilled' && Array.isArray(bkgRes.value)) setBookings(bkgRes.value);
      if (payRes.status === 'fulfilled' && Array.isArray(payRes.value)) setPayments(payRes.value);
      setDemoMode(false);
    } catch (err) {
      console.log('Sync error:', err);
    }
  }

  // Auto-sync every 4 seconds so all mobiles see updated members automatically
  useEffect(() => {
    if (!token || !user || demoMode) return;
    fetchAllData(token, apiUrl);
    const interval = setInterval(() => {
      fetchAllData(token, apiUrl);
    }, 4000);
    return () => clearInterval(interval);
  }, [token, user, apiUrl, demoMode]);

  // Pull-to-refresh
  async function handleRefresh() {
    setRefreshing(true);
    await fetchAllData(token, apiUrl);
    setRefreshing(false);
  }

  function chooseRole(nextRole: Role) {
    setRole(nextRole);
    setEmail(nextRole === 'admin' ? 'admin@forgegym.com' : 'member@forgegym.com');
  }

  async function signIn() {
    setBusy(true);
    setNotice('');

    // Try primary apiUrl first, then Cloudflare URL, then Wi-Fi URL
    const candidates = [apiUrl];
    if (!candidates.includes(CLOUDFLARE_URL)) candidates.push(CLOUDFLARE_URL);
    if (!candidates.includes(LOCAL_WIFI_URL)) candidates.push(LOCAL_WIFI_URL);

    let loggedIn = false;
    let lastError = '';

    for (const candidate of candidates) {
      try {
        const res = await fetch(`${candidate.replace(/\/$/, '')}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.token) {
          setApiUrl(candidate);
          setCustomServerInput(candidate);
          setUser(data.user);
          setToken(data.token);
          setDemoMode(false);
          setServerStatus('connected');
          await fetchAllData(data.token, candidate);
          loggedIn = true;
          break;
        } else if (data.error) {
          lastError = data.error;
        }
      } catch (e: any) {
        lastError = e?.message || 'Network error';
      }
    }

    if (!loggedIn) {
      if (password === 'gym1234') {
        const isAdminUser = role === 'admin';
        setUser({ id: isAdminUser ? 1 : 2, name: isAdminUser ? 'Jordan Lee' : 'Alex Morgan', email, role });
        setToken('');
        setDemoMode(true);
        setNotice(`⚠️ Server unreachable. Running in offline demo mode. Tap reconnect banner to connect live.`);
      } else {
        setNotice(`Could not connect: ${lastError || 'Invalid credentials'}. Demo password is gym1234.`);
      }
    }
    setBusy(false);
  }

  function signOut() {
    setUser(null);
    setToken('');
    setDemoMode(false);
    setTab('home');
    setNotice('');
  }

  // --- BUTTON ACTIONS THAT UPDATE DATABASE & ALL MOBILES ---

  async function addMember() {
    if (!memberName.trim() || !memberEmail.trim()) {
      Alert.alert('Required Fields', 'Please enter both a name and an email address.');
      return;
    }
    setBusy(true);
    try {
      if (token) {
        const created = await apiRequest<Member>(apiUrl, '/members', token, {
          method: 'POST',
          body: JSON.stringify({
            name: memberName.trim(),
            email: memberEmail.trim(),
            phone: memberPhone.trim(),
            planId: selectedPlanId,
          }),
        });
        await fetchAllData();
        Alert.alert('Member Added!', `${created.name} is now registered in the MySQL database. All connected mobiles will see the updated member list.`);
      } else {
        // demo fallback
        const localMember: Member = {
          id: Date.now(),
          name: memberName.trim(),
          email: memberEmail.trim(),
          phone: memberPhone.trim(),
          status: 'active',
          plan_name: plans.find((p) => p.id === selectedPlanId)?.name || 'Essential',
        };
        setMembers((prev) => [localMember, ...prev]);
        Alert.alert('Offline Mode', `${localMember.name} added to local view. Connect to server to sync across all mobiles.`);
      }

      setModal(null);
      setMemberName('');
      setMemberEmail('');
      setMemberPhone('');
    } catch (error) {
      Alert.alert('Error Adding Member', error instanceof Error ? error.message : 'Could not add member.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleMemberStatus(member: Member) {
    const nextStatus = member.status === 'active' ? 'inactive' : 'active';
    try {
      if (token) {
        await apiRequest(apiUrl, `/members/${member.id}/status`, token, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus }),
        });
        await fetchAllData();
      } else {
        setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, status: nextStatus } : m)));
      }
      setNotice(`${member.name} status updated to ${nextStatus}.`);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not change member status.');
    }
  }

  async function addClass() {
    if (!classTitle.trim()) {
      Alert.alert('Required Field', 'Please enter a class name.');
      return;
    }
    setBusy(true);
    try {
      const startsAt = new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' ');
      if (token) {
        await apiRequest(apiUrl, '/classes', token, {
          method: 'POST',
          body: JSON.stringify({
            title: classTitle.trim(),
            category: classCategory,
            startsAt,
            capacity: 16,
            room: 'Studio A',
          }),
        });
        await fetchAllData();
        Alert.alert('Class Scheduled!', `"${classTitle}" has been added to the schedule for all members.`);
      } else {
        const localClass: FitnessClass = {
          id: Date.now(),
          title: classTitle.trim(),
          category: classCategory,
          startsAt,
          durationMinutes: 45,
          capacity: 16,
          booked: 0,
          room: 'Studio A',
        };
        setClasses((prev) => [localClass, ...prev]);
      }
      setModal(null);
      setClassTitle('');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not add class.');
    } finally {
      setBusy(false);
    }
  }

  async function bookClass(fitnessClass: FitnessClass) {
    try {
      if (token) {
        await apiRequest(apiUrl, '/bookings', token, {
          method: 'POST',
          body: JSON.stringify({ classId: fitnessClass.id }),
        });
        await fetchAllData();
        Alert.alert('Spot Reserved!', `You are booked for ${fitnessClass.title}.`);
      } else {
        setBookings((prev) => [
          ...prev,
          {
            id: Date.now(),
            class_id: fitnessClass.id,
            title: fitnessClass.title,
            category: fitnessClass.category,
            startsAt: fitnessClass.startsAt,
            room: fitnessClass.room,
            status: 'booked',
          },
        ]);
        setClasses((prev) => prev.map((c) => (c.id === fitnessClass.id ? { ...c, booked: c.booked + 1 } : c)));
      }
    } catch (error) {
      Alert.alert('Booking Notice', error instanceof Error ? error.message : 'Booking failed.');
    }
  }

  async function cancelBooking(booking: Booking) {
    try {
      if (token) {
        await apiRequest(apiUrl, `/bookings/${booking.id}`, token, { method: 'DELETE' });
        await fetchAllData();
      } else {
        setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: 'cancelled' } : b)));
      }
      setNotice('Booking cancelled.');
    } catch (error) {
      Alert.alert('Notice', error instanceof Error ? error.message : 'Could not cancel booking.');
    }
  }

  async function checkIn() {
    try {
      if (token) {
        await apiRequest(apiUrl, '/attendance', token, { method: 'POST', body: JSON.stringify({}) });
        await fetchAllData();
        Alert.alert('Checked In!', 'Welcome to RSR Gym! Your session check-in has been recorded.');
      } else {
        setDashboard((prev) => ({ ...prev, checkInsToday: (prev?.checkInsToday ?? 126) + 1 }));
        Alert.alert('Checked In (Demo)', 'Check-in recorded locally.');
      }
    } catch (error) {
      Alert.alert('Notice', error instanceof Error ? error.message : 'Check-in failed.');
    }
  }

  async function recordPayment() {
    const amount = Number(paymentAmount);
    if (!paymentEmail.trim() || !amount || amount <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid member email and payment amount in ₹.');
      return;
    }
    setBusy(true);
    try {
      if (token) {
        await apiRequest(apiUrl, '/payments', token, {
          method: 'POST',
          body: JSON.stringify({ email: paymentEmail.trim(), amount, currency: 'INR' }),
        });
        await fetchAllData();
        Alert.alert('Payment Recorded!', `₹${amount.toLocaleString('en-IN')} recorded in the database.`);
      } else {
        setPayments((prev) => [
          {
            id: Date.now(),
            name: paymentEmail,
            amount,
            currency: 'INR',
            status: 'paid',
            paidAt: new Date().toLocaleDateString('en-IN'),
          },
          ...prev,
        ]);
      }
      setModal(null);
      setPaymentEmail('');
      setPaymentAmount('');
    } catch (error) {
      Alert.alert('Payment Error', error instanceof Error ? error.message : 'Could not record payment.');
    } finally {
      setBusy(false);
    }
  }

  // --- LOGIN SCREEN ---
  if (!user) {
    return (
      <SafeAreaView style={styles.loginSafe}>
        <StatusBar style="light" />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.loginScrollContent} bounces={false} keyboardShouldPersistTaps="handled">
            {/* Top Banner Image */}
            <View style={styles.loginHeroContainer}>
              <Image source={LOGIN_HERO_IMAGE} style={styles.loginHeroImage} resizeMode="cover" />
              <View style={styles.loginHeroOverlay}>
                <View style={styles.brandPill}>
                  <Text style={styles.brandPillIconText}>🏋️</Text>
                  <Text style={styles.brandPillText}>RSR GYM</Text>
                </View>

                {/* Server Status Pill */}
                <Pressable onPress={() => setShowServerModal(true)} style={styles.serverStatusPill}>
                  <View style={[styles.serverStatusDot, serverStatus === 'connected' ? styles.dotGreen : serverStatus === 'checking' ? styles.dotYellow : styles.dotRed]} />
                  <Text style={styles.serverStatusText}>
                    {serverStatus === 'connected' ? 'Database Online' : serverStatus === 'checking' ? 'Connecting...' : 'Tap for Server Settings'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Login Card */}
            <View style={styles.loginCardSection}>
              <Text style={styles.loginHeading}>Sign in to RSR Gym</Text>
              <Text style={styles.loginSubheading}>Digital Solutions for a Healthier Tomorrow</Text>

              {/* Role Toggle */}
              <View style={styles.roleSegment}>
                {(['admin', 'member'] as Role[]).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => chooseRole(item)}
                    style={[styles.roleSegmentItem, role === item && styles.roleSegmentActive]}
                  >
                    <Text style={[styles.roleSegmentText, role === item && styles.roleSegmentTextActive]}>
                      {item === 'admin' ? '🛡️ Admin' : '👤 Member'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="admin@forgegym.com"
                placeholderTextColor="#94A3B8"
                style={styles.textInput}
              />

              <Text style={styles.inputLabel}>PASSWORD</Text>
              <TextInput
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor="#94A3B8"
                style={styles.textInput}
                onSubmitEditing={signIn}
              />

              {notice ? <Text style={styles.errorNotice}>{notice}</Text> : null}

              <Pressable
                disabled={busy}
                onPress={signIn}
                style={({ pressed }) => [styles.signInButton, pressed && styles.btnPressed, busy && styles.btnDisabled]}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.signInButtonText}>Sign In  →</Text>}
              </Pressable>

              <Pressable onPress={() => setShowServerModal(true)} style={styles.serverConfigBtn}>
                <Text style={styles.serverConfigBtnText}>⚙️ Server Settings: {apiUrl}</Text>
              </Pressable>

              <View style={styles.demoBox}>
                <Text style={styles.demoText}>Default demo password: <Text style={styles.demoBold}>gym1234</Text></Text>
              </View>

              <Text style={styles.footerTagline}>SMART GYM • HAPPY MEMBERS • GROWING BUSINESS</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Server Connection Modal */}
        <ServerModal
          visible={showServerModal}
          currentUrl={customServerInput}
          onChangeUrl={setCustomServerInput}
          onClose={() => setShowServerModal(false)}
          onSave={async (newUrl) => {
            setApiUrl(newUrl);
            setCustomServerInput(newUrl);
            setShowServerModal(false);
            const ok = await testServer(newUrl);
            setServerStatus(ok ? 'connected' : 'offline');
            if (ok) Alert.alert('Connected!', `Successfully connected to MySQL database at:\n${newUrl}`);
            else Alert.alert('Connection Warning', `Could not reach ${newUrl}. Ensure backend and tunnel/Wi-Fi are running.`);
          }}
          onTest={testServer}
        />
      </SafeAreaView>
    );
  }

  const isAdmin = user.role === 'admin';
  const visibleMembers = members.filter((m) => `${m.name} ${m.email} ${m.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  const memberTabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'home', icon: '⌂', label: 'Home' },
    { key: 'classes', icon: '📅', label: 'Classes' },
    { key: 'progress', icon: '↗', label: 'Progress' },
    { key: 'account', icon: '👤', label: 'Account' },
  ];

  const adminTabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'home', icon: '⌂', label: 'Dashboard' },
    { key: 'members', icon: '👥', label: 'Members' },
    { key: 'classes', icon: '📅', label: 'Classes' },
    { key: 'billing', icon: '💳', label: 'Payments' },
  ];

  const activeTabs = isAdmin ? adminTabs : memberTabs;

  return (
    <SafeAreaView style={styles.appSafe}>
      <StatusBar style="dark" />

      {/* RSR GYM TOPBAR */}
      <View style={styles.topbar}>
        <View style={styles.topbarBrand}>
          <View style={styles.brandAvatar}>
            <Text style={styles.brandAvatarIcon}>🏋️</Text>
          </View>
          <Text style={styles.brandTitle}>RSR GYM</Text>
        </View>

        <View style={styles.topbarRight}>
          <Pressable
            style={styles.topbarBtn}
            onPress={() => {
              setTab('members');
            }}
          >
            <Text style={styles.topbarBtnIcon}>🔍</Text>
          </Pressable>
          <Pressable style={styles.topbarBtn} onPress={() => setTab('account')}>
            <Text style={styles.topbarBtnIcon}>👤</Text>
          </Pressable>
          <Pressable style={styles.topbarBtn} onPress={() => setShowServerModal(true)}>
            <Text style={styles.topbarBtnIcon}>⚙️</Text>
          </Pressable>
          <Pressable style={[styles.topbarBtn, styles.logoutBtn]} onPress={signOut}>
            <Text style={styles.logoutBtnIcon}>⇥</Text>
          </Pressable>
        </View>
      </View>

      {/* SUB-NAVIGATION BAR (FIXED COMPACT HEIGHT - NO STRETCHING) */}
      {isAdmin && (
        <View style={styles.subnavContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subnavBar}>
            {[
              { label: 'Dashboard', key: 'home' },
              { label: 'Members', key: 'members' },
              { label: 'Classes', key: 'classes' },
              { label: 'Attendance', key: 'attendance' },
              { label: 'Payments', key: 'billing' },
            ].map((item) => {
              const isActive = tab === item.key;
              return (
                <Pressable
                  key={item.label}
                  onPress={() => setTab(item.key as Tab)}
                  style={[styles.subnavPill, isActive && styles.subnavPillActive]}
                >
                  <Text style={[styles.subnavText, isActive && styles.subnavTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {demoMode ? (
        <Pressable onPress={() => connectAndSync(apiUrl, true)} style={styles.demoBanner}>
          <Text style={styles.demoBannerText}>⚠️ OFFLINE DEMO MODE · TAP TO CONNECT LIVE BACKEND</Text>
        </Pressable>
      ) : null}

      {notice ? (
        <Pressable onPress={() => setNotice('')} style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
          <Text style={styles.noticeClose}>×</Text>
        </Pressable>
      ) : null}

      {/* MAIN SCROLLABLE CONTENT WITH PULL-TO-REFRESH */}
      <ScrollView
        contentContainerStyle={styles.scrollPage}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1D68FE']} />}
      >
        {tab === 'home' &&
          (isAdmin ? (
            <AdminDashboard
              user={user}
              members={members}
              classes={classes}
              dashboard={dashboard}
              onNavigate={(dest) => setTab(dest)}
              onAddMember={() => setModal('member')}
            />
          ) : (
            <MemberHome
              user={user}
              bookings={bookings}
              dashboard={dashboard}
              onCheckIn={checkIn}
              onClasses={() => setTab('classes')}
            />
          ))}

        {tab === 'members' && isAdmin && (
          <View style={{ gap: 10 }}>
            <PageHeader title="Members" count={`${members.length} total`} action="+ Add Member" onAction={() => setModal('member')} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search members by name, email, or phone..."
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
            />
            {visibleMembers.map((member) => (
              <MemberRow key={member.id} member={member} onToggle={() => toggleMemberStatus(member)} />
            ))}
            {!visibleMembers.length && <EmptyState title="No members found" detail="Tap '+ Add Member' above to register a new member." />}
          </View>
        )}

        {tab === 'classes' && (
          <View style={{ gap: 12 }}>
            <PageHeader
              title={isAdmin ? 'Class Schedule' : 'Find Your Class'}
              count={`${classes.length} sessions`}
              action={isAdmin ? '+ Add Class' : undefined}
              onAction={isAdmin ? () => setModal('class') : undefined}
            />
            {!isAdmin && bookings.some((b) => b.status === 'booked') && (
              <View style={styles.myBookingsSection}>
                <Text style={styles.groupHeading}>MY RESERVED SPOTS</Text>
                {bookings
                  .filter((b) => b.status === 'booked')
                  .map((booking) => (
                    <View key={booking.id} style={styles.bookedRow}>
                      <View style={styles.bookedDateBadge}>
                        <Text style={styles.bookedMonth}>{dateLabel(booking.startsAt).slice(0, 3).toUpperCase()}</Text>
                        <Text style={styles.bookedDay}>{new Date(booking.startsAt.replace(' ', 'T')).getDate()}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.bookedTitle}>{booking.title}</Text>
                        <Text style={styles.bookedMeta}>
                          {timeLabel(booking.startsAt)} · {booking.room}
                        </Text>
                      </View>
                      <Pressable onPress={() => cancelBooking(booking)}>
                        <Text style={styles.cancelLink}>Cancel</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            )}
            <Text style={styles.groupHeading}>AVAILABLE SESSIONS</Text>
            {classes.map((item) => (
              <ClassCard
                key={item.id}
                fitnessClass={item}
                isAdmin={isAdmin}
                isBooked={bookings.some((b) => b.class_id === item.id && b.status === 'booked')}
                onBook={() => bookClass(item)}
              />
            ))}
          </View>
        )}

        {tab === 'attendance' && (
          <View style={{ gap: 12 }}>
            <PageHeader title="Gym Attendance" count="Today's Activity" />
            <View style={styles.attendanceSummaryCard}>
              <Text style={styles.attendanceSummaryNum}>{dashboard?.checkInsToday ?? 126}</Text>
              <Text style={styles.attendanceSummaryLabel}>Total Members Checked In Today</Text>
              <Pressable onPress={checkIn} style={styles.quickCheckinBtn}>
                <Text style={styles.quickCheckinText}>+ Record Check-in</Text>
              </Pressable>
            </View>
          </View>
        )}

        {tab === 'progress' && !isAdmin && <ProgressView bookings={bookings} onClasses={() => setTab('classes')} />}
        {tab === 'billing' && (
          <BillingView members={members} plans={plans} payments={payments} dashboard={dashboard} onRecordPayment={() => setModal('payment')} />
        )}
        {tab === 'account' && <AccountView user={user} plans={plans} apiUrl={apiUrl} onOpenServer={() => setShowServerModal(true)} onSignOut={signOut} />}
      </ScrollView>

      {/* BOTTOM TAB BAR */}
      <View style={styles.bottomTabBar}>
        {activeTabs.map((item) => {
          const isActive = tab === item.key;
          return (
            <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.bottomTabItem}>
              <Text style={[styles.bottomTabIcon, isActive && styles.bottomTabIconActive]}>{item.icon}</Text>
              <Text style={[styles.bottomTabLabel, isActive && styles.bottomTabLabelActive]}>{item.label}</Text>
              {isActive && <View style={styles.bottomTabIndicator} />}
            </Pressable>
          );
        })}
      </View>

      {/* ACTION MODALS */}
      <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => setModal(null)} />
          <View style={styles.modalCard}>
            <View style={styles.modalBar} />
            <Text style={styles.modalSub}>
              {modal === 'member' ? 'NEW MEMBER REGISTRATION' : modal === 'class' ? 'NEW STUDIO CLASS' : 'FINANCIAL TRANSACTION'}
            </Text>
            <Text style={styles.modalTitleText}>
              {modal === 'member' ? 'Register New Member' : modal === 'class' ? 'Add Fitness Class' : 'Record Payment (₹)'}
            </Text>

            {modal === 'member' ? (
              <>
                <Text style={styles.inputLabel}>FULL NAME</Text>
                <TextInput value={memberName} onChangeText={setMemberName} placeholder="e.g. Rahul Sharma" placeholderTextColor="#94A3B8" style={styles.textInput} />

                <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                <TextInput value={memberEmail} onChangeText={setMemberEmail} autoCapitalize="none" keyboardType="email-address" placeholder="e.g. rahul@example.com" placeholderTextColor="#94A3B8" style={styles.textInput} />

                <Text style={styles.inputLabel}>PHONE NUMBER</Text>
                <TextInput value={memberPhone} onChangeText={setMemberPhone} keyboardType="phone-pad" placeholder="+91 98765 43210" placeholderTextColor="#94A3B8" style={styles.textInput} />

                <Text style={styles.inputLabel}>SELECT MEMBERSHIP PLAN</Text>
                <View style={styles.chipRow}>
                  {plans.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setSelectedPlanId(p.id)}
                      style={[styles.chip, selectedPlanId === p.id && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, selectedPlanId === p.id && styles.chipTextActive]}>
                        {p.name} (₹{p.price.toLocaleString('en-IN')})
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable onPress={addMember} disabled={busy} style={[styles.actionBtn, busy && styles.btnDisabled]}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionBtnText}>Register Member to MySQL  →</Text>}
                </Pressable>
              </>
            ) : modal === 'class' ? (
              <>
                <Text style={styles.inputLabel}>CLASS TITLE</Text>
                <TextInput value={classTitle} onChangeText={setClassTitle} placeholder="e.g. Crossfit & HIIT" placeholderTextColor="#94A3B8" style={styles.textInput} />

                <Text style={styles.inputLabel}>CATEGORY</Text>
                <View style={styles.chipRow}>
                  {['Strength', 'Recovery', 'Conditioning', 'Cardio'].map((cat) => (
                    <Pressable key={cat} onPress={() => setClassCategory(cat)} style={[styles.chip, classCategory === cat && styles.chipActive]}>
                      <Text style={[styles.chipText, classCategory === cat && styles.chipTextActive]}>{cat}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable onPress={addClass} disabled={busy} style={[styles.actionBtn, busy && styles.btnDisabled]}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionBtnText}>Add Class to Schedule  →</Text>}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.inputLabel}>MEMBER EMAIL</Text>
                <TextInput value={paymentEmail} onChangeText={setPaymentEmail} autoCapitalize="none" keyboardType="email-address" placeholder="member@email.com" placeholderTextColor="#94A3B8" style={styles.textInput} />

                <Text style={styles.inputLabel}>AMOUNT (₹)</Text>
                <TextInput value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="e.g. 2499" placeholderTextColor="#94A3B8" style={styles.textInput} />

                <Pressable onPress={recordPayment} disabled={busy} style={[styles.actionBtn, busy && styles.btnDisabled]}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionBtnText}>Save Payment in Ledger  →</Text>}
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SERVER CONFIGURATION MODAL */}
      <ServerModal
        visible={showServerModal}
        currentUrl={customServerInput}
        onChangeUrl={setCustomServerInput}
        onClose={() => setShowServerModal(false)}
        onSave={async (newUrl) => {
          setShowServerModal(false);
          await connectAndSync(newUrl, true);
        }}
        onTest={testServer}
      />
    </SafeAreaView>
  );
}

// --- SERVER SETTINGS MODAL ---
function ServerModal({
  visible,
  currentUrl,
  onChangeUrl,
  onClose,
  onSave,
  onTest,
}: {
  visible: boolean;
  currentUrl: string;
  onChangeUrl: (url: string) => void;
  onClose: () => void;
  onSave: (url: string) => void;
  onTest: (url: string) => Promise<boolean>;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const ok = await onTest(currentUrl);
    setTesting(false);
    setTestResult(ok ? '✅ Server & MySQL Database are Online!' : '❌ Unreachable. Check if tunnel or server is running.');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.serverModalContent}>
          <Text style={styles.serverModalTitle}>🌐 Backend Server Connection</Text>
          <Text style={styles.serverModalSubtitle}>
            Configure the API URL so all mobiles stay synced with your central MySQL database.
          </Text>

          <Text style={styles.inputLabel}>SERVER API URL</Text>
          <TextInput
            value={currentUrl}
            onChangeText={(txt) => {
              onChangeUrl(txt);
              setTestResult(null);
            }}
            placeholder="https://apnic-harris-jim-dash.trycloudflare.com/api"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            style={styles.textInput}
          />

          {/* Quick Presets */}
          <Text style={[styles.inputLabel, { marginTop: 4 }]}>QUICK PRESETS</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <Pressable
              onPress={() => {
                onChangeUrl(CLOUDFLARE_URL);
                setTestResult(null);
              }}
              style={styles.presetChip}
            >
              <Text style={styles.presetChipText}>☁️ Cloudflare Live</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onChangeUrl('https://forge-gym-production.up.railway.app/api');
                setTestResult(null);
              }}
              style={styles.presetChip}
            >
              <Text style={styles.presetChipText}>🚂 Railway Cloud</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onChangeUrl(LOCAL_WIFI_URL);
                setTestResult(null);
              }}
              style={styles.presetChip}
            >
              <Text style={styles.presetChipText}>📶 Local Wi-Fi</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onChangeUrl('http://localhost:4000/api');
                setTestResult(null);
              }}
              style={styles.presetChip}
            >
              <Text style={styles.presetChipText}>💻 Localhost</Text>
            </Pressable>
          </View>

          {testResult ? <Text style={[styles.testResultText, testResult.startsWith('✅') ? { color: '#10B981' } : { color: '#EF4444' }]}>{testResult}</Text> : null}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Pressable onPress={handleTest} disabled={testing} style={styles.testBtn}>
              {testing ? <ActivityIndicator size="small" color="#1D68FE" /> : <Text style={styles.testBtnText}>Test Connection</Text>}
            </Pressable>
            <Pressable onPress={() => onSave(currentUrl)} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save & Connect</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- ADMIN DASHBOARD COMPONENT ---
function AdminDashboard({
  user,
  members,
  classes,
  dashboard,
  onNavigate,
  onAddMember,
}: {
  user: User;
  members: Member[];
  classes: FitnessClass[];
  dashboard: Dashboard | null;
  onNavigate: (tab: Tab) => void;
  onAddMember: () => void;
}) {
  const totalMembers = dashboard?.members ?? (members.length || 540);
  const activeMembers = dashboard?.members ?? (members.filter((m) => m.status === 'active').length || 486);
  const expiringSoon = 32;
  const revenueStr = dashboard?.monthlyRevenue ? `₹${Number(dashboard?.monthlyRevenue).toLocaleString('en-IN')}` : '₹2,45,000';
  const todayCheckins = dashboard?.checkInsToday ?? 126;
  const ptSessions = 24;
  const totalClasses = classes.length || 18;
  const newLeads = 12;

  const growthBars = [
    { month: 'Jan', height: 40 },
    { month: 'Feb', height: 55 },
    { month: 'Mar', height: 70 },
    { month: 'Apr', height: 85 },
    { month: 'May', height: 100 },
    { month: 'Jun', height: 115 },
    { month: 'Jul', height: 145 },
  ];

  const revPoints = [
    { month: 'Jan', left: '3%', bottom: '22%' },
    { month: 'Feb', left: '18%', bottom: '38%' },
    { month: 'Mar', left: '34%', bottom: '38%' },
    { month: 'Apr', left: '50%', bottom: '50%' },
    { month: 'May', left: '66%', bottom: '68%' },
    { month: 'Jun', left: '80%', bottom: '64%' },
    { month: 'Jul', left: '94%', bottom: '88%' },
  ];

  return (
    <View style={styles.dashboardContainer}>
      <View style={styles.dashboardHeader}>
        <Text style={styles.dashboardTitleText}>Dashboard</Text>
        <Pressable onPress={onAddMember} style={styles.addMemberBtn}>
          <Text style={styles.addMemberBtnText}>+ Add Member</Text>
        </Pressable>
      </View>

      {/* TOP 4 KPI CARDS (ALL CLICKABLE TO RELEVANT TABS) */}
      <View style={styles.kpiGrid}>
        <Pressable onPress={() => onNavigate('members')} style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#E0EDFF' }]}>
            <Text style={{ fontSize: 20 }}>👥</Text>
          </View>
          <View style={styles.kpiInfo}>
            <Text style={styles.kpiValue}>{totalMembers}</Text>
            <Text style={styles.kpiLabel}>Total Members</Text>
          </View>
        </Pressable>

        <Pressable onPress={() => onNavigate('members')} style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#DCFCE7' }]}>
            <Text style={{ fontSize: 20 }}>📅</Text>
          </View>
          <View style={styles.kpiInfo}>
            <Text style={styles.kpiValue}>{activeMembers}</Text>
            <Text style={styles.kpiLabel}>Active Members</Text>
          </View>
        </Pressable>

        <Pressable onPress={() => onNavigate('members')} style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#FFEDD5' }]}>
            <Text style={{ fontSize: 20 }}>🗓️</Text>
          </View>
          <View style={styles.kpiInfo}>
            <Text style={styles.kpiValue}>{expiringSoon}</Text>
            <Text style={styles.kpiLabel}>Expiring Soon</Text>
          </View>
        </Pressable>

        <Pressable onPress={() => onNavigate('billing')} style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#F3E8FF' }]}>
            <Text style={{ fontSize: 20 }}>💰</Text>
          </View>
          <View style={styles.kpiInfo}>
            <Text style={[styles.kpiValue, { fontSize: 17 }]}>{revenueStr}</Text>
            <Text style={styles.kpiLabel}>This Month Revenue</Text>
          </View>
        </Pressable>
      </View>

      {/* CHARTS */}
      <View style={styles.chartsContainer}>
        {/* Member Growth */}
        <View style={styles.chartBox}>
          <Text style={styles.chartHeaderTitle}>Member Growth</Text>
          <View style={styles.chartCanvas}>
            <View style={[styles.gridLine, { top: '0%' }]}><Text style={styles.axisLabel}>300</Text></View>
            <View style={[styles.gridLine, { top: '33%' }]}><Text style={styles.axisLabel}>200</Text></View>
            <View style={[styles.gridLine, { top: '66%' }]}><Text style={styles.axisLabel}>100</Text></View>
            <View style={[styles.gridLine, { top: '99%' }]}><Text style={styles.axisLabel}>0</Text></View>

            <View style={styles.barsRow}>
              {growthBars.map((b) => (
                <View key={b.month} style={styles.barCol}>
                  <View style={[styles.barBar, { height: b.height }]} />
                  <Text style={styles.barLabel}>{b.month}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Revenue */}
        <View style={styles.chartBox}>
          <Text style={styles.chartHeaderTitle}>Revenue</Text>
          <View style={styles.chartCanvas}>
            <View style={[styles.gridLine, { top: '0%' }]}><Text style={styles.axisLabel}>300</Text></View>
            <View style={[styles.gridLine, { top: '33%' }]}><Text style={styles.axisLabel}>200</Text></View>
            <View style={[styles.gridLine, { top: '66%' }]}><Text style={styles.axisLabel}>100</Text></View>
            <View style={[styles.gridLine, { top: '99%' }]}><Text style={styles.axisLabel}>0</Text></View>

            <View style={styles.revLineArea} />

            {revPoints.map((pt) => (
              <View
                key={pt.month}
                style={[styles.revDot, { left: pt.left as any, bottom: pt.bottom as any }]}
              />
            ))}

            <View style={styles.revCallout}>
              <Text style={styles.revCalloutAmount}>₹2,45L</Text>
              <View style={styles.revTrendBadge}>
                <Text style={styles.revTrendText}>↑ 18%</Text>
                <Text style={styles.revTrendSub}>vs. last month</Text>
              </View>
            </View>

            <View style={styles.lineMonthsRow}>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'].map((m) => (
                <Text key={m} style={styles.barLabel}>{m}</Text>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* BOTTOM 4 QUICK STATS (CLICKABLE) */}
      <View style={styles.bottomStatsGrid}>
        <Pressable onPress={() => onNavigate('attendance')} style={styles.bottomStatCard}>
          <View style={[styles.bottomStatIcon, { backgroundColor: '#EA580C' }]}>
            <Text style={styles.bottomStatEmoji}>🏃</Text>
          </View>
          <View style={styles.bottomStatBody}>
            <Text style={styles.bottomStatSub}>Today's Check-ins</Text>
            <Text style={styles.bottomStatNum}>{todayCheckins}</Text>
          </View>
        </Pressable>

        <Pressable onPress={() => onNavigate('classes')} style={styles.bottomStatCard}>
          <View style={[styles.bottomStatIcon, { backgroundColor: '#7C3AED' }]}>
            <Text style={styles.bottomStatEmoji}>🏋️</Text>
          </View>
          <View style={styles.bottomStatBody}>
            <Text style={styles.bottomStatSub}>PT Sessions</Text>
            <Text style={styles.bottomStatNum}>{ptSessions}</Text>
          </View>
        </Pressable>

        <Pressable onPress={() => onNavigate('classes')} style={styles.bottomStatCard}>
          <View style={[styles.bottomStatIcon, { backgroundColor: '#0284C7' }]}>
            <Text style={styles.bottomStatEmoji}>👥</Text>
          </View>
          <View style={styles.bottomStatBody}>
            <Text style={styles.bottomStatSub}>Classes</Text>
            <Text style={styles.bottomStatNum}>{totalClasses}</Text>
          </View>
        </Pressable>

        <Pressable onPress={onAddMember} style={styles.bottomStatCard}>
          <View style={[styles.bottomStatIcon, { backgroundColor: '#E11D48' }]}>
            <Text style={styles.bottomStatEmoji}>📋</Text>
          </View>
          <View style={styles.bottomStatBody}>
            <Text style={styles.bottomStatSub}>New Leads</Text>
            <Text style={styles.bottomStatNum}>{newLeads}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

// --- MEMBER HOME ---
function MemberHome({
  user,
  bookings,
  dashboard,
  onCheckIn,
  onClasses,
}: {
  user: User;
  bookings: Booking[];
  dashboard: Dashboard | null;
  onCheckIn: () => void;
  onClasses: () => void;
}) {
  const nextBooking = bookings.find((b) => b.status === 'booked');
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.memberGreetingCard}>
        <Text style={styles.memberGreetSub}>WELCOME BACK</Text>
        <Text style={styles.memberGreetTitle}>Hi, {user.name.split(' ')[0]} 👋</Text>
        <Text style={styles.memberGreetDetail}>RSR Gym Membership: Unlimited Plan</Text>
      </View>

      <Pressable onPress={onCheckIn} style={({ pressed }) => [styles.memberCheckinHero, pressed && styles.btnPressed]}>
        <View>
          <Text style={styles.checkinTag}>AT RSR GYM NOW?</Text>
          <Text style={styles.checkinHeading}>Quick Workout Check-in</Text>
          <Text style={styles.checkinSub}>Log your session to build your streak</Text>
        </View>
        <Text style={{ fontSize: 32 }}>⚡</Text>
      </Pressable>

      <View style={styles.memberStatsRow}>
        <View style={styles.memberStatBlock}>
          <Text style={styles.memberStatBig}>{String(dashboard?.visitsThisMonth ?? 12)}</Text>
          <Text style={styles.memberStatSub}>VISITS THIS MONTH</Text>
        </View>
        <View style={styles.memberStatDivider} />
        <View style={styles.memberStatBlock}>
          <Text style={styles.memberStatBig}>
            {String(dashboard?.upcomingBookings ?? bookings.filter((b) => b.status === 'booked').length)}
          </Text>
          <Text style={styles.memberStatSub}>UPCOMING SESSIONS</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <Text style={styles.groupHeading}>NEXT SCHEDULED SESSION</Text>
        <Pressable onPress={onClasses}>
          <Text style={{ color: COLORS.primaryBlue, fontWeight: '700', fontSize: 12 }}>View Schedule →</Text>
        </Pressable>
      </View>

      {nextBooking ? (
        <View style={styles.nextSessionCard}>
          <Text style={styles.nextSessionTitle}>{nextBooking.title}</Text>
          <Text style={styles.nextSessionMeta}>
            {dateLabel(nextBooking.startsAt)} at {timeLabel(nextBooking.startsAt)} • {nextBooking.room}
          </Text>
        </View>
      ) : (
        <View style={styles.noSessionCard}>
          <Text style={styles.noSessionTitle}>No sessions booked yet</Text>
          <Text style={styles.noSessionDesc}>Join a group workout class or schedule personal training.</Text>
          <Pressable onPress={onClasses} style={styles.exploreClassesBtn}>
            <Text style={styles.exploreClassesText}>Explore Available Classes</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// --- SUBVIEWS ---
function PageHeader({ title, count, action, onAction }: { title: string; count?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.pageHeader}>
      <View>
        <Text style={styles.pageHeaderTitle}>{title}</Text>
        {count ? <Text style={styles.pageHeaderCount}>{count}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} style={styles.headerActionBtn}>
          <Text style={styles.headerActionBtnText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MemberRow({ member, onToggle }: { member: Member; onToggle: () => void }) {
  return (
    <View style={styles.memberItem}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberAvatarText}>{initials(member.name)}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.memberItemName}>{member.name}</Text>
        <Text style={styles.memberItemEmail}>{member.email}</Text>
        {member.phone ? <Text style={styles.memberItemPhone}>📞 {member.phone}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.memberPlanBadge}>{member.plan_name || 'Standard'}</Text>
        <Pressable onPress={onToggle} style={styles.statusToggleBtn}>
          <Text style={[styles.memberStatusText, member.status === 'active' ? styles.statusActive : styles.statusInactive]}>
            {member.status === 'active' ? '● Active' : '○ Inactive'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ClassCard({
  fitnessClass,
  isAdmin,
  isBooked,
  onBook,
}: {
  fitnessClass: FitnessClass;
  isAdmin: boolean;
  isBooked: boolean;
  onBook: () => void;
}) {
  const full = fitnessClass.booked >= fitnessClass.capacity;
  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryPillText}>{fitnessClass.category.toUpperCase()}</Text>
        </View>
        <Text style={styles.spotsCount}>{Math.max(fitnessClass.capacity - fitnessClass.booked, 0)} spots remaining</Text>
      </View>
      <Text style={styles.sessionTitle}>{fitnessClass.title}</Text>
      <Text style={styles.sessionTime}>
        📅 {dateLabel(fitnessClass.startsAt)} · ⏰ {timeLabel(fitnessClass.startsAt)} · 📍 {fitnessClass.room}
      </Text>
      {!isAdmin && (
        <Pressable
          disabled={full || isBooked}
          onPress={onBook}
          style={[styles.bookBtn, (full || isBooked) && styles.bookBtnDisabled]}
        >
          <Text style={[styles.bookBtnText, (full || isBooked) && styles.bookBtnTextDisabled]}>
            {isBooked ? '✓ Reserved' : full ? 'Class Full' : 'Book Session  →'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function ProgressView({ bookings, onClasses }: { bookings: Booking[]; onClasses: () => void }) {
  return (
    <View style={{ gap: 14 }}>
      <PageHeader title="Training Progress" count="September 2026" />
      <View style={styles.progressHero}>
        <Text style={styles.progressNum}>12</Text>
        <Text style={styles.progressHeroTitle}>Workouts Completed This Month</Text>
        <Text style={styles.progressHeroSub}>Consistency is key to sustainable results.</Text>
      </View>
      <Pressable onPress={onClasses} style={styles.actionBtn}>
        <Text style={styles.actionBtnText}>Book Your Next Session  →</Text>
      </Pressable>
    </View>
  );
}

function BillingView({
  members,
  plans,
  payments,
  dashboard,
  onRecordPayment,
}: {
  members: Member[];
  plans: Plan[];
  payments: Payment[];
  dashboard: Dashboard | null;
  onRecordPayment: () => void;
}) {
  const revenue = dashboard?.monthlyRevenue ?? 245000;
  return (
    <View style={{ gap: 14 }}>
      <PageHeader title="Billing & Plans" count="Monthly Revenue" action="+ Record Payment" onAction={onRecordPayment} />
      <View style={styles.revenueCardHero}>
        <Text style={styles.revenueHeroSub}>TOTAL REVENUE COLLECTED</Text>
        <Text style={styles.revenueHeroBig}>₹{Number(revenue).toLocaleString('en-IN')}</Text>
        <Text style={styles.revenueHeroTrend}>↑ 18% growth vs. last billing cycle</Text>
      </View>

      <Text style={styles.groupHeading}>MEMBERSHIP PLANS</Text>
      {plans.map((p) => (
        <View key={p.id} style={styles.planCard}>
          <View>
            <Text style={styles.planTitle}>{p.name}</Text>
            <Text style={styles.planSub}>{p.description}</Text>
          </View>
          <Text style={styles.planCost}>₹{p.price.toLocaleString('en-IN')}</Text>
        </View>
      ))}

      <Text style={styles.groupHeading}>PAYMENT TRANSACTIONS</Text>
      {payments.slice(0, 5).map((pay) => (
        <View key={pay.id} style={styles.paymentCard}>
          <Text style={{ fontSize: 20 }}>💳</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.payName}>{pay.name || `Payment #${pay.id}`}</Text>
            <Text style={styles.payDate}>{pay.paidAt || 'Recent transaction'}</Text>
          </View>
          <Text style={styles.payAmount}>₹{Number(pay.amount).toLocaleString('en-IN')}</Text>
        </View>
      ))}
    </View>
  );
}

function AccountView({
  user,
  plans,
  apiUrl,
  onOpenServer,
  onSignOut,
}: {
  user: User;
  plans: Plan[];
  apiUrl: string;
  onOpenServer: () => void;
  onSignOut: () => void;
}) {
  return (
    <View style={{ gap: 14 }}>
      <PageHeader title="Profile" count="Account Information" />
      <View style={styles.profileBox}>
        <View style={styles.profileAvatarLarge}>
          <Text style={styles.profileAvatarLargeText}>{initials(user.name)}</Text>
        </View>
        <Text style={styles.profileBoxName}>{user.name}</Text>
        <Text style={styles.profileBoxEmail}>{user.email}</Text>
        <Text style={styles.profileBoxRole}>Role: {user.role.toUpperCase()}</Text>
      </View>

      <Pressable onPress={onOpenServer} style={styles.serverSettingsRow}>
        <View>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>⚙️ Server Connection</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{apiUrl}</Text>
        </View>
        <Text style={{ color: '#1D68FE', fontWeight: '800' }}>Change →</Text>
      </Pressable>

      <Pressable onPress={onSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutBtnText}>Sign Out from RSR Gym</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  loginSafe: { flex: 1, backgroundColor: '#071630' },
  loginScrollContent: { flexGrow: 1, backgroundColor: '#0B1B3D' },
  loginHeroContainer: { width: '100%', height: 260, position: 'relative', overflow: 'hidden' },
  loginHeroImage: { width: '100%', height: '100%' },
  loginHeroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 27, 61, 0.45)',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 22, 48, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  brandPillIconText: { fontSize: 16, marginRight: 6 },
  brandPillText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, letterSpacing: 1.2 },

  serverStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    alignSelf: 'flex-end',
    gap: 6,
  },
  serverStatusDot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: '#10B981' },
  dotYellow: { backgroundColor: '#F59E0B' },
  dotRed: { backgroundColor: '#EF4444' },
  serverStatusText: { color: '#F1F5F9', fontSize: 10, fontWeight: '700' },

  loginCardSection: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
  },
  loginHeading: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  loginSubheading: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 18 },
  roleSegment: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  roleSegmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  roleSegmentActive: { backgroundColor: '#1D68FE' },
  roleSegmentText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  roleSegmentTextActive: { color: '#FFFFFF' },
  inputLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 1, marginBottom: 6 },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 14,
  },
  errorNotice: { color: '#EF4444', fontSize: 12, marginBottom: 10, fontWeight: '600' },
  signInButton: {
    backgroundColor: '#1D68FE',
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#1D68FE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  signInButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  serverConfigBtn: { marginTop: 12, alignItems: 'center' },
  serverConfigBtnText: { color: '#1D68FE', fontSize: 11, fontWeight: '700' },
  btnPressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.6 },
  demoBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  demoText: { fontSize: 11, color: '#64748B' },
  demoBold: { fontWeight: '700', color: '#0F172A' },
  footerTagline: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.2,
  },

  // App Layout
  appSafe: { flex: 1, backgroundColor: COLORS.canvas },
  topbar: {
    height: 58,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topbarBrand: { flexDirection: 'row', alignItems: 'center' },
  brandAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0B1B3D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandAvatarIcon: { fontSize: 18 },
  brandTitle: { fontSize: 18, fontWeight: '900', color: '#0B1B3D', letterSpacing: 0.8 },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topbarBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topbarBtnIcon: { fontSize: 15, color: '#334155' },
  logoutBtn: { backgroundColor: '#FEE2E2' },
  logoutBtnIcon: { fontSize: 15, color: '#EF4444', fontWeight: '800' },

  // Fixed Subnav Container
  subnavContainer: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  subnavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
    height: 48,
  },
  subnavPill: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subnavPillActive: { backgroundColor: '#1D68FE' },
  subnavText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  subnavTextActive: { color: '#FFFFFF', fontWeight: '800' },

  demoBanner: { backgroundColor: '#FEF3C7', paddingVertical: 6, alignItems: 'center' },
  demoBannerText: { color: '#92400E', fontWeight: '800', fontSize: 10, letterSpacing: 0.8 },
  noticeBox: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    backgroundColor: '#0B1B3D',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noticeText: { color: '#FFFFFF', fontSize: 12, flex: 1 },
  noticeClose: { color: '#38BDF8', fontSize: 20, marginLeft: 10 },
  scrollPage: { padding: 16, paddingBottom: 32 },

  // Dashboard Styles
  dashboardContainer: { gap: 16 },
  dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dashboardTitleText: { fontSize: 26, fontWeight: '800', color: '#0F172A' },
  addMemberBtn: { backgroundColor: '#1D68FE', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addMemberBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiIconWrap: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  kpiInfo: { flex: 1 },
  kpiValue: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', marginTop: 2 },

  // Charts
  chartsContainer: { gap: 14 },
  chartBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  chartHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  chartCanvas: { height: 160, position: 'relative', marginTop: 8 },
  gridLine: {
    position: 'absolute',
    left: 28,
    right: 0,
    height: 1,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
  },
  axisLabel: { position: 'absolute', left: -26, fontSize: 9, color: '#94A3B8', fontWeight: '700' },
  barsRow: {
    position: 'absolute',
    left: 28,
    right: 0,
    bottom: 0,
    top: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingBottom: 20,
  },
  barCol: { alignItems: 'center', width: 28 },
  barBar: { width: 14, backgroundColor: '#1D68FE', borderRadius: 4 },
  barLabel: { fontSize: 9, color: '#64748B', fontWeight: '700', marginTop: 6 },
  revLineArea: {
    position: 'absolute',
    left: 28,
    right: 0,
    bottom: 22,
    top: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 8,
  },
  revDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  revCallout: { position: 'absolute', right: 8, bottom: 42, alignItems: 'flex-end' },
  revCalloutAmount: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  revTrendBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  revTrendText: { color: '#10B981', fontWeight: '800', fontSize: 12 },
  revTrendSub: { color: '#64748B', fontSize: 9 },
  lineMonthsRow: {
    position: 'absolute',
    left: 28,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },

  // Bottom 4 Quick Stats
  bottomStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bottomStatCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomStatIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  bottomStatEmoji: { fontSize: 18 },
  bottomStatBody: { flex: 1 },
  bottomStatSub: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  bottomStatNum: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginTop: 2 },

  // Member Home Styles
  memberGreetingCard: { backgroundColor: '#0B1B3D', borderRadius: 14, padding: 18 },
  memberGreetSub: { color: '#38BDF8', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  memberGreetTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 4 },
  memberGreetDetail: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  memberCheckinHero: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkinTag: { color: '#064E3B', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  checkinHeading: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginTop: 2 },
  checkinSub: { color: '#D1FAE5', fontSize: 11, marginTop: 2 },
  memberStatsRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    padding: 16,
  },
  memberStatBlock: { flex: 1, alignItems: 'center' },
  memberStatBig: { fontSize: 26, fontWeight: '900', color: '#0F172A' },
  memberStatSub: { fontSize: 9, fontWeight: '800', color: '#64748B', marginTop: 4 },
  memberStatDivider: { width: 1, backgroundColor: '#E2E8F0' },
  nextSessionCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14 },
  nextSessionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  nextSessionMeta: { fontSize: 12, color: '#64748B', marginTop: 4 },
  noSessionCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 18, alignItems: 'center' },
  noSessionTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  noSessionDesc: { fontSize: 11, color: '#64748B', textAlign: 'center', marginTop: 4, marginBottom: 12 },
  exploreClassesBtn: { backgroundColor: '#1D68FE', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  exploreClassesText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },

  // Bottom Navigation
  bottomTabBar: {
    height: 58,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bottomTabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomTabIcon: { fontSize: 20, color: '#94A3B8' },
  bottomTabIconActive: { color: '#1D68FE' },
  bottomTabLabel: { fontSize: 10, color: '#64748B', marginTop: 2, fontWeight: '700' },
  bottomTabLabelActive: { color: '#1D68FE' },
  bottomTabIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#1D68FE', marginTop: 2 },

  // Header & Search
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pageHeaderTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  pageHeaderCount: { fontSize: 11, color: '#64748B', marginTop: 2 },
  headerActionBtn: { backgroundColor: '#0B1B3D', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  headerActionBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  searchInput: {
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    fontSize: 13,
    color: '#0F172A',
  },

  // Member Item
  memberItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  memberAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E0EDFF', alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 13, fontWeight: '800', color: '#1D68FE' },
  memberItemName: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  memberItemEmail: { fontSize: 11, color: '#64748B', marginTop: 2 },
  memberItemPhone: { fontSize: 10, color: '#10B981', marginTop: 2, fontWeight: '600' },
  memberPlanBadge: { fontSize: 10, fontWeight: '700', color: '#1D68FE' },
  statusToggleBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  memberStatusText: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  statusActive: { color: '#10B981' },
  statusInactive: { color: '#EF4444' },

  // Class Card
  sessionCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, marginBottom: 8 },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  categoryPill: { backgroundColor: '#E0EDFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  categoryPillText: { color: '#1D68FE', fontSize: 9, fontWeight: '900' },
  spotsCount: { fontSize: 11, color: '#64748B' },
  sessionTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  sessionTime: { fontSize: 11, color: '#64748B', marginTop: 4 },
  bookBtn: { backgroundColor: '#1D68FE', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  bookBtnDisabled: { backgroundColor: '#F1F5F9' },
  bookBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  bookBtnTextDisabled: { color: '#94A3B8' },

  myBookingsSection: { backgroundColor: '#E0EDFF', borderRadius: 12, padding: 14, marginBottom: 10 },
  groupHeading: { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 1, marginBottom: 8 },
  bookedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 10, borderRadius: 8, marginBottom: 6 },
  bookedDateBadge: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#0B1B3D', alignItems: 'center', justifyContent: 'center' },
  bookedMonth: { fontSize: 8, fontWeight: '900', color: '#38BDF8' },
  bookedDay: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  bookedTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  bookedMeta: { fontSize: 10, color: '#64748B', marginTop: 2 },
  cancelLink: { color: '#EF4444', fontSize: 11, fontWeight: '800', padding: 6 },

  // Attendance
  attendanceSummaryCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 24, alignItems: 'center' },
  attendanceSummaryNum: { fontSize: 44, fontWeight: '900', color: '#0F172A' },
  attendanceSummaryLabel: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 16 },
  quickCheckinBtn: { backgroundColor: '#1D68FE', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  quickCheckinText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  // Progress
  progressHero: { backgroundColor: '#0B1B3D', borderRadius: 14, padding: 20, alignItems: 'center' },
  progressNum: { fontSize: 50, fontWeight: '900', color: '#38BDF8' },
  progressHeroTitle: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', marginTop: 4 },
  progressHeroSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  // Billing
  revenueCardHero: { backgroundColor: '#0B1B3D', borderRadius: 14, padding: 18 },
  revenueHeroSub: { fontSize: 10, color: '#94A3B8', fontWeight: '800', letterSpacing: 1 },
  revenueHeroBig: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', marginTop: 4 },
  revenueHeroTrend: { fontSize: 12, color: '#10B981', fontWeight: '700', marginTop: 4 },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  planSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  planCost: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  payName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  payDate: { fontSize: 10, color: '#64748B', marginTop: 2 },
  payAmount: { fontSize: 14, fontWeight: '900', color: '#0F172A' },

  // Profile
  profileBox: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 24, alignItems: 'center' },
  profileAvatarLarge: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0B1B3D', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileAvatarLargeText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  profileBoxName: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  profileBoxEmail: { fontSize: 12, color: '#64748B', marginTop: 4 },
  profileBoxRole: { fontSize: 11, fontWeight: '700', color: '#1D68FE', marginTop: 6 },
  serverSettingsRow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signOutBtn: { borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, paddingVertical: 14, alignItems: 'center', backgroundColor: '#FEF2F2' },
  signOutBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 13 },

  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  emptyDetail: { fontSize: 11, color: '#64748B', marginTop: 4 },

  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  modalBackdrop: { flex: 1 },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 16 },
  modalSub: { fontSize: 10, fontWeight: '800', color: '#1D68FE', letterSpacing: 1 },
  modalTitleText: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 4, marginBottom: 16 },
  actionBtn: { backgroundColor: '#1D68FE', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  actionBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: '#1D68FE' },
  chipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  chipTextActive: { color: '#FFFFFF' },

  // Server Modal
  serverModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  serverModalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  serverModalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 4, marginBottom: 16 },
  presetChip: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  presetChipText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  testResultText: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  testBtn: { flex: 1, height: 46, borderRadius: 8, borderWidth: 1, borderColor: '#1D68FE', alignItems: 'center', justifyContent: 'center' },
  testBtnText: { color: '#1D68FE', fontWeight: '800', fontSize: 13 },
  saveBtn: { flex: 1, height: 46, borderRadius: 8, backgroundColor: '#1D68FE', alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
});
