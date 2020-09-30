const api_token = '1091494251:AAHQ0Gs_sdtJKiCAV99cVh0w-i7nOGc4WqE';
const { Telegraf } = require('telegraf');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Markup = require('telegraf/markup');
const Extra = require('telegraf/extra');
const papa = require('papaparse');
const request = require('request');
const mongoose = require('mongoose');
const fs = require('fs');
const data_marker = require('./scene/data_marker');
const nlp_module = require('./scene/nlp');


const stage = new Stage();
const bot = new Telegraf(api_token);
const db_user = 'sprestay';
const db_password = 'xF9kibsAwCXWYbkF';
const db_name = 'nlp_bot';
const db_url = `mongodb+srv://${db_user}:${db_password}@cluster0.oqvee.mongodb.net/${db_name}?retryWrites=true&w=majority`;

const connect = mongoose.connect(db_url, { useNewUrlParser: true , useUnifiedTopology: true, useFindAndModify: false});
connect.then((success) => {
    console.log("Successfully connected to database");
}).catch((err) => console.log("ERROR: ", err));


let headers = [];
let question = null;
let answer = null;
let head = false;
let data = [];
let result = {};
let previous = null; // последнее сообщения этой сцены

bot.use(session());
bot.use(stage.middleware());
data_marker(stage);
nlp_module(stage);

bot.start(ctx => {
    ctx.reply(
    `Привет!
    На данный момент поддерживаются только файлы в формате csv.
    
    Загрузи файл, и продолжим
    
    В файле есть заголовки (названия столбцов)?
    `, Extra.markup(Markup.inlineKeyboard([
        Markup.callbackButton('Заголовки есть', 'header_true'),
        Markup.callbackButton('Заголовков нет', 'header_false'),
    ])));
});

// Блок про Header
bot.action('header_true', ctx => {
    head = true;
    ctx.editMessageReplyMarkup({
        inline_keyboard: [[
            Markup.callbackButton('✔ Заголовки есть ✔', 'header_true'),
            Markup.callbackButton('Заголовков нет', 'header_false'),
    ]]});
});

bot.action('header_false', ctx => {
    head = false;
    ctx.editMessageReplyMarkup({
        inline_keyboard: [[
            Markup.callbackButton('Заголовки есть', 'header_true'),
            Markup.callbackButton('✔ Заголовков нет ✔', 'header_false'),
        ]]});
});
// Конец блока про Header

bot.on('document', async ctx => {
    let id = ctx.update.message.document.file_id;
    let url = null;
    await ctx.telegram.getFileLink(id)
    .then(src => url = src);

    const dataStream = request.get(url);
    const parseStream = papa.parse(papa.NODE_STREAM_INPUT, {
        download: true,
        encoding: 'utf8',
    });

    dataStream.pipe(parseStream);

    parseStream.on("data", chunk => {
        data.push(chunk);
    });

    parseStream.on("finish", async () => {
        await ctx.reply("Файл загружен. Отметь где вопрос, а где ответ");
        let first = data[0];
        for (let d of first)
            await ctx.reply(d, Extra.markup(Markup.inlineKeyboard([
                            Markup.callbackButton("? Это вопрос ?", "question"),
                            Markup.callbackButton("! Это ответ !", "answer")
                        ]))).then(res => headers.push(res.message_id));
        ctx.reply("Отметьте столбец с ответами, и, если есть, с вопросами.\nНажмите 'Далее'", {
            reply_markup: {
                keyboard: [[Markup.button("➤ Далее ➤")]]
            }
        })
    });
});
// Нет обработчика ошибок - можно отметить несколько колонок с вопросами.
bot.action('question', ctx => {
    let id = ctx.update.callback_query.message.message_id;
    question = id;
    ctx.editMessageReplyMarkup({
        inline_keyboard: [
            [Markup.callbackButton("❓Это вопрос❓", "question"),Markup.callbackButton("! Это ответ !", "answer")]
        ]
    })
})

bot.action('answer', ctx => {
    let id = ctx.update.callback_query.message.message_id;
    answer = id;
    ctx.editMessageReplyMarkup({
        inline_keyboard: [
            [Markup.callbackButton("? Это вопрос ?", "question"),Markup.callbackButton("❗Это ответ❗", "answer")]
        ]
    })
})

bot.hears("➤ Далее ➤", async ctx => {
    
    if (!answer) {
        ctx.reply("Необходимо указать хотя бы 'Ответ'");
        return
    } else {
        if (head)
            data = data.slice(1,);
        answ_indx = headers.indexOf(answer);

        if (question) {
            quest_indx = headers.indexOf(question);
        
            for (let row of data) {
                if (!result[row[quest_indx]])
                    result[row[quest_indx]] = [];
                result[row[quest_indx]].push(row[answ_indx]);
            }
        } else 
            result['question'] = data.map(item => item[answ_indx]);

        exports['result'] = result;

        await ctx.reply("Теперь разметим данные.", { // Разбиваем на 2 ответа, чтобы в одном убрать клаву, а в другом добавить.
            reply_markup: {
                remove_keyboard: true,
            }
        });

        let msg = ''; // Если есть "Вопросы"
        if (question) {
            msg = `
            Всего вопросов: <b>${Object.keys(result).length.toString()}</b>
            Разбивка по вопросам:
            _______________________________
            ${Object.keys(result).map(item => {
                return (item + ' -- ' + result[item].length.toString())
            }).join('\n')}
            _______________________________
            `
        }

        await ctx.replyWithHTML(`
        ${msg}
        Всего вопросов - ${data.length}
        _________________________________
        Теперь вручную разметим вопросы.
        `, {
            reply_markup: {
                inline_keyboard: fs.existsSync('model.nlp') ? [
                        [Markup.callbackButton("Разметить", 'go')],
                        [Markup.callbackButton("Использовать готовую модель", 'ready')]
                    ] : [[Markup.callbackButton("Приступить", 'go')]]
            }
        }).then(res => previous = res.message_id);
    }
});

bot.action('go', async ctx => {
    ctx.deleteMessage(previous);
    await ctx.scene.enter('dataMarker');
});

bot.action("ready", async ctx => {
    ctx.deleteMessage(previous);
    await ctx.scene.enter('analiseScene');
});

bot.launch()