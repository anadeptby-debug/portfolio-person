// Бот-визитка для портфолио: отвечает на /start кнопкой Mini App и пересылает владельцу
// сообщения клиентов. Cloudflare Worker, принимает обновления Telegram по вебхуку.
//
// Переменные (wrangler.toml → [vars]): APP_URL, OWNER_USERNAME, OWNER_NAME
// Секреты (wrangler secret put): BOT_TOKEN, WEBHOOK_SECRET, OWNER_CHAT_ID (необязательно)

const api = (env, method, body) =>
  fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function keyboard(env, section) {
  const app = section ? `${env.APP_URL}#s/${section}` : env.APP_URL;
  return {
    inline_keyboard: [
      [{ text: "Открыть портфолио", web_app: { url: app } }],
      [{ text: "Написать мне лично", url: `https://t.me/${env.OWNER_USERNAME}` }],
    ],
  };
}

function greeting(env, user) {
  const hi = user && user.first_name ? `Здравствуйте, ${user.first_name}!` : "Здравствуйте!";
  return `${hi} Это портфолио ${env.OWNER_NAME}.\n\n`
    + "Делаю Telegram-ботов и Mini Apps, ИИ-ассистентов, автоматизацию, интеграции с 1С и CRM, парсинг, сайты и веб-сервисы.\n\n"
    + "Откройте портфолио кнопкой ниже. Вопрос или задачу можно написать прямо сюда — сообщение придёт мне, отвечу лично.";
}

export async function handleUpdate(update, env) {
  const msg = update.message;
  if (!msg || msg.chat.type !== "private") return;
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const [cmd, arg] = text.split(/\s+/, 2);
  const command = cmd.startsWith("/") ? cmd.split("@")[0] : "";

  if (command === "/start" || command === "/portfolio") {
    // t.me/<бот>?start=<id направления> — сразу открыть нужную карточку
    const section = arg && /^[\w-]{1,40}$/.test(arg) ? arg : "";
    await api(env, "sendMessage", { chat_id: chatId, text: greeting(env, msg.from), reply_markup: keyboard(env, section) });
    return;
  }
  if (command === "/contact") {
    await api(env, "sendMessage", {
      chat_id: chatId,
      text: `Напишите мне: @${env.OWNER_USERNAME}. Или прямо сюда — сообщение придёт мне.`,
      reply_markup: keyboard(env),
    });
    return;
  }
  if (env.OWNER_CHAT_ID && String(chatId) === String(env.OWNER_CHAT_ID)) {
    await api(env, "sendMessage", { chat_id: chatId, text: "Это вы. Сообщения клиентов будут приходить сюда." });
    return;
  }
  // Любое другое сообщение — переслать владельцу и подтвердить клиенту
  if (env.OWNER_CHAT_ID) {
    await api(env, "forwardMessage", { chat_id: env.OWNER_CHAT_ID, from_chat_id: chatId, message_id: msg.message_id });
    await api(env, "sendMessage", { chat_id: chatId, text: "Спасибо, передал. Отвечу лично в ближайшее время.", reply_markup: keyboard(env) });
  } else {
    await api(env, "sendMessage", { chat_id: chatId, text: `Чтобы обсудить задачу, напишите мне: @${env.OWNER_USERNAME}`, reply_markup: keyboard(env) });
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ok");
    // Принимаем только запросы от Telegram: секрет задаётся в setWebhook
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    try {
      await handleUpdate(await request.json(), env);
    } catch (e) {
      console.error(e);
    }
    return new Response("ok");
  },
};
