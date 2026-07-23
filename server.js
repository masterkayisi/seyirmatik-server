const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'Seyirmatik Server' });
});

const LEMON_CHECKOUT_URL = "https://seyirmatik.lemonsqueezy.com/checkout/buy/da52ec67-20eb-4ce8-be80-877881051a70";

// Real Payment Checkout Page (Auto-redirects to Lemon Squeezy)
app.get('/pay', (req, res) => {
  const { socketId, lang } = req.query;
  const redirectUrl = `${LEMON_CHECKOUT_URL}?checkout[custom][socketId]=${socketId || ''}`;
  
  const translations = {
    tr: { title: "Güvenli Ödeme Sayfasına Yönlendiriliyorsunuz...", desc: "Lütfen bekleyin, Lemon Squeezy ödeme ekranına aktarılıyorsunuz." },
    en: { title: "Redirecting to Secure Payment Page...", desc: "Please wait, redirecting you to Lemon Squeezy checkout." },
    de: { title: "Weiterleitung zur sicheren Zahlungsseite...", desc: "Bitte warten Sie, Sie werden zur Lemon Squeezy Kasse weitergeleitet." },
    es: { title: "Redirigiendo a la página de pago seguro...", desc: "Por favor espere, redirigiéndote a la pantalla de pago de Lemon Squeezy." },
    fr: { title: "Redirection vers la page de paiement sécurisé...", desc: "Veuillez patienter, redirection vers le paiement Lemon Squeezy." }
  };

  const t = translations[lang] || translations['tr'];

  res.send(`
    <!DOCTYPE html>
    <html lang="${lang || 'tr'}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${t.title}</title>
      <style>
        body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f0f12; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
        .card { background: #18181c; border: 1px solid rgba(255, 117, 140, 0.3); border-radius: 20px; padding: 40px; max-width: 380px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .spinner { width: 44px; height: 44px; border: 4px solid rgba(255,117,140,0.15); border-top-color: #ff758c; border-radius: 50%; animation: spin 0.9s infinite linear; margin: 0 auto 20px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        h2 { font-size: 1.15rem; color: #fff; margin: 0 0 8px 0; font-weight: 700; }
        p { color: #a1a1aa; font-size: 0.85rem; line-height: 1.4; margin: 0; }
      </style>
      <script>
        setTimeout(function() {
          window.location.href = "${redirectUrl}";
        }, 600);
      </script>
    </head>
    <body>
      <div class="card">
        <div class="spinner"></div>
        <h2>${t.title}</h2>
        <p>${t.desc}</p>
      </div>
    </body>
    </html>
  `);
});

// Lemon Squeezy Webhook / Confirmation Endpoint
app.all('/confirm-payment', (req, res) => {
  const socketId = req.query.socketId || (req.body && req.body.socketId) || (req.body && req.body.meta && req.body.meta.custom_data && req.body.meta.custom_data.socketId);
  console.log(`Lemon Squeezy Payment confirmed for socketId: ${socketId}`);
  
  if (socketId && io.sockets.sockets.get(socketId)) {
    io.to(socketId).emit('premium-activated', {
      isPremium: true,
      avatarFrameId: 'premium-fire'
    });
  } else {
    io.emit('premium-activated', {
      isPremium: true,
      avatarFrameId: 'premium-fire'
    });
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Ödeme Başarılı</title>
      <style>
        body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f0f12; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
        .box { background: #18181c; border: 1px solid #32d583; padding: 32px; border-radius: 20px; box-shadow: 0 0 30px rgba(50, 213, 131, 0.2); max-width: 380px; }
        h1 { color: #32d583; margin: 0 0 12px 0; font-size: 1.5rem; }
        p { color: #a1a1aa; font-size: 0.9rem; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>🎉 Ödeme Alındı & Doğrulandı!</h1>
        <p>Desteğin için teşekkür ederiz! Premium özellikler eklentinizde kalıcı olarak aktif edildi.</p>
        <p><small style="color: #666;">Bu sekmeyi kapatıp Seyirmatik eklentinize dönebilirsiniz.</small></p>
      </div>
    </body>
    </html>
  `);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {}; // Track room members: { roomId: { socketId: username } }

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  let currentRoom = null;
  let currentUsername = null;

  // 1. Join Room
  socket.on('join-room', ({ roomId, username, avatar }) => {
    // Validate inputs
    if (!roomId || !username) {
      socket.emit('error-msg', 'Room ID and Username are required.');
      return;
      }
    
    currentRoom = roomId;
    currentUsername = username;
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {};
    }
    rooms[roomId][socket.id] = {
      username: username,
      avatar: avatar || { type: 'sprite', index: Math.floor(Math.random() * 50) + 1 }
    };

    console.log(`${username} (${socket.id}) joined room ${roomId}`);

    // Get list of other users in this room (excluding the joiner)
    const otherUsers = Object.keys(rooms[roomId])
      .filter(id => id !== socket.id)
      .map(id => ({ 
        socketId: id, 
        username: rooms[roomId][id].username,
        avatar: rooms[roomId][id].avatar
      }));

    // Send the joiner the list of existing users to initiate WebRTC
    socket.emit('room-users', otherUsers);

    // Notify other users in the room
    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      username: username,
      avatar: avatar || { type: 'sprite', index: Math.floor(Math.random() * 50) + 1 }
    });

    const isUserPremium = !!(avatar && (avatar.isPremium === true || avatar.avatarFrameId === 'premium-fire'));

    // Send a system message to the chat
    io.to(roomId).emit('chat-message', {
      sender: 'System',
      text: `${username} odaya katıldı.`,
      timestamp: Date.now(),
      isSystem: true,
      isPremium: isUserPremium
    });
  });

  // 2. Video Playback Sync
  socket.on('sync-video', (data) => {
    if (!currentRoom) return;
    // Broadcast sync event to everyone else in the room
    console.log(`Sync event in room ${currentRoom} from ${currentUsername}:`, data);
    socket.to(currentRoom).emit('sync-video', {
      sender: currentUsername,
      senderId: socket.id,
      action: data.action, // 'play', 'pause', 'seek'
      time: data.time      // current time in seconds
    });

    // Also broadcast a system chat notification for major events to keep track
    if (data.action === 'play') {
      socket.to(currentRoom).emit('chat-message', {
        sender: 'System',
        text: `${currentUsername} videoyu oynattı.`,
        timestamp: Date.now(),
        isSystem: true
      });
    } else if (data.action === 'pause') {
      socket.to(currentRoom).emit('chat-message', {
        sender: 'System',
        text: `${currentUsername} videoyu durdurdu.`,
        timestamp: Date.now(),
        isSystem: true
      });
    }
  });

  // Video status update (domain, url, detected)
  socket.on('video-status-update', (data) => {
    if (!currentRoom) return;
    console.log(`Video status from ${currentUsername}:`, data);
    socket.to(currentRoom).emit('partner-video-status', {
      username: currentUsername,
      socketId: socket.id,
      detected: data.detected,
      domain: data.domain,
      url: data.url
    });
  });

  // 3. Chat Messages
  socket.on('send-message', (text) => {
    if (!currentRoom || !currentUsername) return;
    const userProfile = rooms[currentRoom] ? rooms[currentRoom][socket.id] : null;
    io.to(currentRoom).emit('chat-message', {
      sender: currentUsername,
      senderId: socket.id,
      text: text,
      timestamp: Date.now(),
      isSystem: false,
      avatar: userProfile ? userProfile.avatar : null
    });
  });

  // Profile Updates
  socket.on('update-profile', ({ username, avatar }) => {
    if (!currentRoom || !rooms[currentRoom] || !rooms[currentRoom][socket.id]) return;
    
    const userObj = rooms[currentRoom][socket.id];
    const oldUsername = userObj.username || currentUsername;
    
    rooms[currentRoom][socket.id] = { username, avatar };
    currentUsername = username;
    
    // Notify other users of profile updates
    socket.to(currentRoom).emit('user-profile-updated', {
      socketId: socket.id,
      username: username,
      avatar: avatar
    });
    
    if (oldUsername !== username) {
      io.to(currentRoom).emit('chat-message', {
        sender: 'System',
        text: `${oldUsername} adını ${username} olarak değiştirdi.`,
        timestamp: Date.now(),
        isSystem: true
      });
    }
  });

  // 4. WebRTC Signaling
  socket.on('webrtc-signal', ({ targetSocketId, signal }) => {
    // Forward the WebRTC signal to the target peer
    io.to(targetSocketId).emit('webrtc-signal', {
      senderSocketId: socket.id,
      signal: signal
    });
  });

  // 5. Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom][socket.id];
      
      // Clean up room if empty
      if (Object.keys(rooms[currentRoom]).length === 0) {
        delete rooms[currentRoom];
      } else {
        // Notify others
        socket.to(currentRoom).emit('user-left', {
          socketId: socket.id,
          username: currentUsername
        });

        io.to(currentRoom).emit('chat-message', {
          sender: 'System',
          text: `${currentUsername} odadan ayrıldı.`,
          timestamp: Date.now(),
          isSystem: true
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Seyirmatik signaling server running on port ${PORT}`);
});
