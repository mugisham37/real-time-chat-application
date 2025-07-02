'use client';

import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents } from '../types/socket';

class SocketManager {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
    
    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      autoConnect: true,
    });

    this.setupEventListeners();
    return this.socket;
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Connected to server:', this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server:', reason);
      this.handleReconnection();
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      this.handleReconnection();
    });
  }

  private handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      
      console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.socket?.connect();
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
    return this.socket;
  }

  isConnected() {
    return this.socket?.connected || false;
  }
}

export const socketManager = new SocketManager();
export default socketManager;
