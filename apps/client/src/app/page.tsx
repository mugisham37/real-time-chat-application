'use client';

import { useEffect, useState } from 'react';
import { socketManager } from '../lib/socket';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string>('');
  const [apiStatus, setApiStatus] = useState<string>('checking...');

  useEffect(() => {
    // Test API connection
    const testAPI = async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          const data = await response.json();
          setApiStatus(`✅ API Connected - ${data.message}`);
        } else {
          setApiStatus('❌ API Connection Failed');
        }
      } catch (error) {
        setApiStatus('❌ API Connection Error');
      }
    };

    // Test Socket connection
    const socket = socketManager.connect();
    
    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socket.id || '');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setSocketId('');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Initial state
    if (socket.connected) {
      handleConnect();
    }

    testAPI();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  const handleTestMessage = () => {
    const socket = socketManager.getSocket();
    if (socket && isConnected) {
      socket.emit('message:send', {
        conversationId: 'test-conversation',
        content: 'Hello from client!',
        type: 'TEXT'
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-8 text-center">
            🚀 Chat Application Setup Test
          </h1>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* API Status */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">
                📡 API Connection
              </h2>
              <div className="space-y-2">
                <p className="text-lg">{apiStatus}</p>
                <p className="text-sm text-gray-600">
                  Backend API: {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}
                </p>
              </div>
            </div>

            {/* Socket Status */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">
                🔌 Socket Connection
              </h2>
              <div className="space-y-2">
                <p className="text-lg">
                  {isConnected ? '✅ Socket Connected' : '❌ Socket Disconnected'}
                </p>
                {socketId && (
                  <p className="text-sm text-gray-600">
                    Socket ID: {socketId}
                  </p>
                )}
                <p className="text-sm text-gray-600">
                  Socket URL: {process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000'}
                </p>
              </div>
            </div>
          </div>

          {/* Test Actions */}
          <div className="mt-8 text-center">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              🧪 Test Actions
            </h3>
            <div className="space-x-4">
              <button
                onClick={handleTestMessage}
                disabled={!isConnected}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  isConnected
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Send Test Message
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-lg font-medium bg-gray-600 hover:bg-gray-700 text-white transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>

          {/* Project Info */}
          <div className="mt-8 bg-blue-50 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-blue-800 mb-4">
              📋 Project Setup Status
            </h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-blue-700 mb-2">Frontend (Next.js)</h4>
                <ul className="space-y-1 text-blue-600">
                  <li>✅ Next.js 14 configured</li>
                  <li>✅ TypeScript setup</li>
                  <li>✅ Tailwind CSS ready</li>
                  <li>✅ Socket.io client ready</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-blue-700 mb-2">Backend (Node.js)</h4>
                <ul className="space-y-1 text-blue-600">
                  <li>✅ Express.js server</li>
                  <li>✅ Socket.io server</li>
                  <li>✅ PostgreSQL + Prisma</li>
                  <li>✅ Redis for caching</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="mt-8 bg-green-50 rounded-lg p-6">
            <h3 className="text-xl font-semibold text-green-800 mb-4">
              🎯 Next Steps
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-green-700">
              <li>Install dependencies: <code className="bg-green-100 px-2 py-1 rounded">npm install</code></li>
              <li>Start PostgreSQL and Redis services</li>
              <li>Run database migrations: <code className="bg-green-100 px-2 py-1 rounded">npm run db:migrate</code></li>
              <li>Start development servers: <code className="bg-green-100 px-2 py-1 rounded">npm run dev</code></li>
              <li>Begin implementing chat features</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
