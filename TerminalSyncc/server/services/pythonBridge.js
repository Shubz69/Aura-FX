import axios from "axios";
import { decrypt } from "../services/encryption.js";
import dotenv from "dotenv";

dotenv.config();

/* =====================================================
   CONFIG
===================================================== */

const WORKER_URL =
  process.env.PYTHON_WORKER_URL ||
  "http://127.0.0.1:8000/api/v1"; 
 
const WORKER_SECRET = process.env.WORKER_SECRET;

/* =====================================================
   AXIOS WORKER CLIENT
===================================================== */

const workerClient = axios.create({
  baseURL: WORKER_URL,
  timeout: 150000,
  headers: {
    "Content-Type": "application/json",
    "x-worker-secret": WORKER_SECRET
  }
});

/* =====================================================
   PREPARE CREDENTIALS
===================================================== */

const prepareCredentials = (account) => {
  try {
    
    // ✅ CASE 1: verification request (plain password)
    if (account.password) {
        return {
            login: Number(account.account_login),
            password: account.password,
            server: account.broker_server
        };
    }

    // ✅ CASE 2: DB stored encrypted credentials
    return {
        login: Number(account.account_login),
        password: decrypt({
            content: account.enc_password,
            iv: account.iv,
            tag: account.tag
        }),
        server: account.broker_server
    };

  } catch (err) {
    console.error("[Credential Prep Error]", err.message);
    throw new Error("CREDENTIAL_DECRYPTION_FAILED");
  }
};

/* =====================================================
   GENERIC WORKER CALL
===================================================== */

const callWorker = async (endpoint, credentials) => {
  try {
    return (await workerClient.post(endpoint, credentials)).data;
  } catch (error) {
    // Only retry if it's a network/timeout error and NOT already a retry
    if (!error.response && !error.config._isRetry) {
      console.warn("⚠️ MT5 Busy or Timeout - Retrying once...");
      error.config._isRetry = true; // Mark to avoid infinite loops
      try {
        const retry = await workerClient.post(endpoint, credentials);
        return retry.data;
      } catch (retryError) {
        handleAxiosError(retryError);
      }
    }
    handleAxiosError(error);
  }
};

/* =====================================================
   ACCOUNT SYNC
===================================================== */

export const syncWithPython = async (dbAccount) => {
  const credentials = prepareCredentials(dbAccount);
  return callWorker("/sync", credentials);
};

/* =====================================================
   LIVE POSITIONS
===================================================== */

export const getLiveStats = async (dbAccount) => {
  const credentials = prepareCredentials(dbAccount);
  return callWorker("/positions", credentials);
};

/* =====================================================
   ERROR HANDLER
===================================================== */

const handleAxiosError = (error) => {

  if (error.code === "ECONNREFUSED") {
    throw new Error(
      "PYTHON_WORKER_OFFLINE"
    );
  }

  const message =
    error.response?.data?.detail ||
    error.message ||
    "WORKER_CONNECTION_ERROR";

  console.error("[MT5 Worker Error]:", message);

  throw new Error(message);
};