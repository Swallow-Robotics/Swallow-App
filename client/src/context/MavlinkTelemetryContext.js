/**
 * MAVLink telemetry context: background serial reader that parses MAVLink
 * from a telemetry radio and stores decoded messages in state.
 *
 * Wrap the Fly map (or app) with MavlinkTelemetryProvider and use
 * useMavlinkTelemetry() to get telemetry state and connect/disconnect.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  isSerialSupported,
  requestSerialPort,
  runMavlinkReadLoop,
  decodeMavlinkMessage,
} from '../services/mavlinkSerial';

const DEFAULT_BAUD = 57600;
const MAX_ERROR_LOG = 50;
const MAX_STATUS_LOG = 100;

const defaultContext = {
  isSupported: false,
  connectionStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'
  error: null,
  errorLog: [],
  heartbeat: null,
  gps: null,
  sysStatus: null,
  attitude: null,
  globalPosition: null,
  vfrHud: null,
  statusMessages: [],
  rawMessageCount: 0,
  messageRate: 0,
  unknownMsgIds: [],
  connect: async () => {},
  disconnect: () => {},
  clearErrorLog: () => {},
  clearStatusMessages: () => {},
};

const MavlinkTelemetryContext = createContext(defaultContext);

export function MavlinkTelemetryProvider({ children }) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const [heartbeat, setHeartbeat] = useState(null);
  const [gps, setGps] = useState(null);
  const [sysStatus, setSysStatus] = useState(null);
  const [attitude, setAttitude] = useState(null);
  const [globalPosition, setGlobalPosition] = useState(null);
  const [rawMessageCount, setRawMessageCount] = useState(0);
  const [messageRate, setMessageRate] = useState(0);
  const [vfrHud, setVfrHud] = useState(null);
  const [statusMessages, setStatusMessages] = useState([]);
  const [errorLog, setErrorLog] = useState([]);
  const [unknownMsgIds, setUnknownMsgIds] = useState([]);

  const portRef = useRef(null);
  const stopRef = useRef(false);
  const msgTotalRef = useRef(0);
  const msgWindowRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      setRawMessageCount(msgTotalRef.current);
      setMessageRate(msgWindowRef.current);
      msgWindowRef.current = 0;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const pushError = useCallback((msg) => {
    setErrorLog(prev => {
      const entry = { ts: Date.now(), message: String(msg) };
      const next = [entry, ...prev];
      return next.length > MAX_ERROR_LOG ? next.slice(0, MAX_ERROR_LOG) : next;
    });
  }, []);

  const handleMessage = useCallback((messageId, payload) => {
    msgTotalRef.current += 1;
    msgWindowRef.current += 1;
    const decoded = decodeMavlinkMessage(messageId, payload);
    if (!decoded) return;
    switch (decoded.type) {
      case 'HEARTBEAT':
        setHeartbeat(decoded);
        break;
      case 'GPS_RAW_INT':
        setGps(decoded);
        break;
      case 'SYS_STATUS':
        setSysStatus(decoded);
        break;
      case 'ATTITUDE':
        setAttitude(decoded);
        break;
      case 'GLOBAL_POSITION_INT':
        setGlobalPosition(decoded);
        break;
      case 'VFR_HUD':
        setVfrHud(decoded);
        break;
      case 'STATUSTEXT':
        setStatusMessages(prev => {
          const entry = { ts: Date.now(), severity: decoded.severity, text: decoded.text };
          const next = [entry, ...prev];
          return next.length > MAX_STATUS_LOG ? next.slice(0, MAX_STATUS_LOG) : next;
        });
        break;
      default:
        setUnknownMsgIds(prev =>
          prev.includes(messageId) ? prev : [...prev, messageId]
        );
        break;
    }
  }, []);

  const connect = useCallback(
    async (baudRate = DEFAULT_BAUD) => {
      if (!isSerialSupported()) {
        setError(new Error('Web Serial not supported'));
        setConnectionStatus('error');
        return;
      }
      setConnectionStatus('connecting');
      setError(null);
      stopRef.current = false;
      try {
        const port = await requestSerialPort(baudRate);
        portRef.current = port;
        setConnectionStatus('connected');

        runMavlinkReadLoop(
          port,
          handleMessage,
          stopRef,
          err => {
            setError(err);
            setConnectionStatus('error');
            pushError(err?.message ?? 'Read loop error');
          },
          () => {
            setConnectionStatus('disconnected');
          }
        );
      } catch (err) {
        const isUserCancelled =
          err?.name === 'NotFoundError' ||
          (typeof err?.message === 'string' &&
            err.message.includes('No port selected'));
        if (isUserCancelled) {
          setError(null);
          setConnectionStatus('disconnected');
        } else {
          setError(err);
          setConnectionStatus('error');
          pushError(err?.message ?? 'Connection error');
        }
      }
    },
    [handleMessage, pushError]
  );

  const disconnect = useCallback(async () => {
    stopRef.current = true;
    const port = portRef.current;
    portRef.current = null;
    if (port) {
      try {
        await port.close();
      } catch {
        // ignore
      }
    }
    setConnectionStatus('disconnected');
    setError(null);
  }, []);

  const clearErrorLog = useCallback(() => setErrorLog([]), []);
  const clearStatusMessages = useCallback(() => setStatusMessages([]), []);

  const value = {
    isSupported: isSerialSupported(),
    connectionStatus,
    error: error?.message ?? null,
    errorLog,
    heartbeat,
    gps,
    sysStatus,
    attitude,
    globalPosition,
    vfrHud,
    statusMessages,
    rawMessageCount,
    messageRate,
    unknownMsgIds,
    connect,
    disconnect,
    clearErrorLog,
    clearStatusMessages,
  };

  return (
    <MavlinkTelemetryContext.Provider value={value}>
      {children}
    </MavlinkTelemetryContext.Provider>
  );
}

export function useMavlinkTelemetry() {
  const ctx = useContext(MavlinkTelemetryContext);
  if (!ctx) {
    throw new Error(
      'useMavlinkTelemetry must be used within MavlinkTelemetryProvider'
    );
  }
  return ctx;
}

export default MavlinkTelemetryContext;
