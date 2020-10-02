const Markup = require('telegraf/markup');
const Extra = require('telegraf/extra');
const Scene = require('telegraf/scenes/base');
const WizardScene = require("telegraf/scenes/wizard");
const { NlpManager } = require('node-nlp');
var data = require('../index');

const manager = new NlpManager({ languages: ['ru'], nlu: { log: true } });
let question_list = [];

function analise(stage) {
    const analise = new WizardScene(
    'analiseScene',

    async ctx => {
        manager.load('model.nlp'); // А что будет, если модель пуста?
        data = data.result;
        console.log(data);
        question_list = Object.keys(data);

        for (let quest of question_list) {
            let answers = {};
            await ctx.replyWithHTML("<b>" + quest + "</b>");
            
            for (let answer of data[quest]) {
                let resp = await manager.process('ru', answer);
                if (resp.intent in answers)
                    answers[resp.intent]++;
                else
                    answers[resp.intent] = 1;
            }
            let for_return = Object.keys(answers).length > 0 ? (Object.keys(answers).map(key => key + " - " + answers[key]).join("\n")) : '<b>Нету данных</b>';
            ctx.replyWithHTML(for_return);
        }
    });
    stage.register(analise);
    return analise;
};

module.exports = analise;