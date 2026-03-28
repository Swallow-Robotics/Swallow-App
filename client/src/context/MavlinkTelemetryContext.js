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

const defaultContext = {
  isSupported: false,
  connectionStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'
  error: null,
  heartbeat: null,
  gps: null,
  sysStatus: null,
  attitude: null,
  globalPosition: null,
  rawMessageCount: 0,
  connect: async () => {},
  disconnect: () => {},
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

  const portRef = useRef(null);
  const stopRef = useRef(false);

  const handleMessage = useCallback((messageId, payload) => {
    setRawMessageCount(c => c + 1);
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
      default:
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
        }
      }
    },
    [handleMessage]
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

  const value = {
    isSupported: isSerialSupported(),
    connectionStatus,
    error: error?.message ?? null,
    heartbeat,
    gps,
    sysStatus,
    attitude,
    globalPosition,
    rawMessageCount,
    connect,
    disconnect,
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
