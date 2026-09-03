import VoiceAPI from './voiceAPIClient';

// @twilio/voice-sdk грузим динамически, а не статическим импортом.
// Статический импорт затягивал весь SDK (~500 КБ исходников: call.js,
// device.js, peerconnection.js, audiohelper.js и т.д.) в общий чанк точки
// входа дашборда, то есть он скачивался КАЖДЫМ оператором при каждом заходе,
// даже если голосовые звонки в аккаунте не используются вовсе.
// Device нужен ровно в одном месте — initializeDevice(), которое вызывается
// только при реальном старте звонка, поэтому подгружаем модуль там.

const createCallDisconnectedEvent = () => new CustomEvent('call:disconnected');

class TwilioVoiceClient extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.activeConnection = null;
    this.initialized = false;
    this.inboxId = null;
  }

  async initializeDevice(inboxId) {
    this.destroyDevice();

    const [{ Device }, response] = await Promise.all([
      import('@twilio/voice-sdk'),
      VoiceAPI.getToken(inboxId),
    ]);
    const { token, account_id } = response || {};
    if (!token) throw new Error('Invalid token');

    this.device = new Device(token, {
      allowIncomingWhileBusy: true,
      disableAudioContextSounds: true,
      appParams: { account_id },
    });

    this.device.removeAllListeners();
    this.device.on('connect', conn => {
      this.activeConnection = conn;
      conn.on('disconnect', this.onDisconnect);
    });

    this.device.on('disconnect', this.onDisconnect);

    this.device.on('tokenWillExpire', async () => {
      const r = await VoiceAPI.getToken(this.inboxId);
      if (r?.token) this.device.updateToken(r.token);
    });

    this.initialized = true;
    this.inboxId = inboxId;

    return this.device;
  }

  get hasActiveConnection() {
    return !!this.activeConnection;
  }

  setMuted(shouldMute) {
    if (!this.activeConnection) return false;
    this.activeConnection.mute(shouldMute);
    return shouldMute;
  }

  endClientCall() {
    if (this.activeConnection) {
      this.activeConnection.disconnect();
    }
    this.activeConnection = null;
    if (this.device) {
      this.device.disconnectAll();
    }
  }

  destroyDevice() {
    if (this.device) {
      this.device.destroy();
    }
    this.activeConnection = null;
    this.device = null;
    this.initialized = false;
    this.inboxId = null;
  }

  async joinClientCall({ to, conversationId, callSid }) {
    if (!this.device || !this.initialized || !to) return null;
    if (this.activeConnection) return this.activeConnection;

    const params = {
      To: to,
      is_agent: 'true',
      conversation_id: conversationId,
      call_sid: callSid,
    };

    const connection = await this.device.connect({ params });
    this.activeConnection = connection;

    connection.on('disconnect', this.onDisconnect);

    return connection;
  }

  onDisconnect = () => {
    this.activeConnection = null;
    this.dispatchEvent(createCallDisconnectedEvent());
  };
}

export default new TwilioVoiceClient();
