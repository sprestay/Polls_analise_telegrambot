const Markup = require('telegraf/markup');
const Extra = require('telegraf/extra');
const WizardScene = require("telegraf/scenes/wizard");
const Model = require('../db_models/model');
const { NlpManager } = require('node-nlp');
const { SentimentManager } = require('node-nlp');
var data = require('../index');

const manager = new NlpManager({ languages: ['ru'], nlu: { log: true } });
const sentiment = new SentimentManager();

let question_list = [];
let current_selected = null;
let models = [];
let questions = {};
let emotions = {neutral: [], positive: [], negative: []};
let msgs_id = [];

function analise(stage) {
    const analise = new WizardScene(
    'analiseScene',

    async ctx => {
        current_selected = ctx.update.callback_query && ['ready', 'analise'].indexOf(ctx.update.callback_query.data) == -1 ? ctx.update.callback_query.data : null;
        if (!current_selected) {
            models = await Model.find({});
            if (models.length != 0) {
                for (let model of models) {
                    let msg = `<b>${model.name}</b>
                    Поддерживает следующие критерии
                    _______________________________
                    ${model.categories.join(', ')}
                    `;
                    await ctx.replyWithHTML(msg, {
                        reply_markup: {
                            inline_keyboard: [[Markup.callbackButton('Выбрать', model.id)]]
                        }
                    });
                }
            }
            return;
        }
        manager.load('./models/' + current_selected + '.nlp');
        data = data.result;
        question_list = Object.keys(data);

        for (let quest of question_list) {
            questions[quest] = {};
            await ctx.replyWithHTML("<b>" + quest + "</b>");
            
            for (let answer of data[quest]) {
                let resp = await manager.process('ru', answer);
                let emo = await sentiment.process('ru', answer);
                ///////////////////////////////////////////////
                if ('vote' in emo) 
                    if (emo.vote in emotions)
                        emotions[emo.vote].push(answer);
                //////////////////////////////////////////////
                if (resp.intent in questions[quest])
                    questions[quest][resp.intent].push(answer);
                else
                    questions[quest][resp.intent] = [answer];
            }
            for (let key of Object.keys(questions[quest])) {
                await ctx.reply(key + ' ----- ' + questions[quest][key].length, Extra.markup(Markup.inlineKeyboard([
                    Markup.callbackButton('Предпросмотр', 'pre_' + quest + '_' + key),
                    Markup.callbackButton('Показать все ответы', 'all_' + quest + '_' + key)
                ])));
            }
            await ctx.replyWithHTML("<b>Разбивка по эмоциональному настроению</b>\n<i>не всегда и везде корректно</i>\n" + Object.keys(emotions).map(item => '<b>' + item + '</b>' + ' --- ' + emotions[item].length.toString()).join('\n'),
            Extra.markup(Markup.inlineKeyboard([
                Markup.callbackButton('Позитивные', 'positive'),
                Markup.callbackButton('Нейтрально', 'neutral'),
                Markup.callbackButton('Негативное', 'negative')
            ])));
        }
        return ctx.wizard.next();
    },
    
    async (ctx) => {
        if (!ctx.update.callback_query) 
            return
        for (let id of msgs_id)
            await ctx.deleteMessage(id);  

        msgs_id = [];
        let info = ctx.update.callback_query.data.split('_');
        if (info[0] == 'pre') {
            let data = questions[info[1]][info[2]].sort((a,b) => a.length > b.length ? -1 : 1).slice(0,5);
            for (let d of data) 
                ctx.reply(d).then(res => msgs_id.push(res.message_id));
        } else if (info[0] == 'all') {
            let data = questions[info[1]][info[2]];
            for (let d of data)
                ctx.reply(d).then(res => msgs_id.push(res.message_id));
        } else
            for (let d of emotions[ctx.update.callback_query.data])
                        ctx.reply(d).then(res => msgs_id.push(res.message_id));
    });

    stage.register(analise);
    return analise;
};

module.exports = analise;