"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureKeyManager = void 0;
const electron_1 = require("electron");
class SecureKeyManager {
    static instance;
    constructor() { }
    static getInstance() {
        if (!SecureKeyManager.instance) {
            SecureKeyManager.instance = new SecureKeyManager();
        }
        return SecureKeyManager.instance;
    }
    // Helper to dynamically load electron-store (ESM)
    async getStore() {
        const { default: Store } = await Promise.resolve().then(() => __importStar(require('electron-store')));
        return new Store();
    }
    /**
     * Encrypts and saves the API key to disk.
     */
    async setKey(apiKey) {
        if (!electron_1.safeStorage.isEncryptionAvailable()) {
            console.error('SafeStorage encryption is not available.');
            return false;
        }
        try {
            const buffer = electron_1.safeStorage.encryptString(apiKey);
            const store = await this.getStore();
            store.set('secure.openaiApiKey', buffer.toString('hex'));
            return true;
        }
        catch (error) {
            console.error('Failed to encrypt API key:', error);
            return false;
        }
    }
    /**
     * Retrieves and decrypts the API key.
     * Returns null if missing or decryption fails.
     */
    async getKey() {
        if (!electron_1.safeStorage.isEncryptionAvailable())
            return null;
        try {
            const store = await this.getStore();
            const hex = store.get('secure.openaiApiKey');
            if (!hex)
                return null;
            const buffer = Buffer.from(hex, 'hex');
            return electron_1.safeStorage.decryptString(buffer);
        }
        catch (error) {
            // Graceful Failure: If OS keychain is locked or changed, treat as missing.
            console.error('Decryption failed, treating key as missing:', error);
            return null;
        }
    }
    /**
     * Checks the status of the key without exposing it.
     */
    async getKeyStatus() {
        if (!electron_1.safeStorage.isEncryptionAvailable()) {
            return 'locked';
        }
        try {
            const store = await this.getStore();
            const hex = store.get('secure.openaiApiKey');
            if (!hex) {
                return 'missing';
            }
            return 'secured';
        }
        catch (error) {
            console.error('Error checking key status:', error);
            return 'missing';
        }
    }
}
exports.SecureKeyManager = SecureKeyManager;
