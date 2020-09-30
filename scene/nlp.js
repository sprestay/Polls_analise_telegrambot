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
        manager.load('model.nlp');
        data = data.result;
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
            ctx.replyWithHTML(Object.keys(answers).map(key => key + " - " + answers[key]).join("\n"));
        }
    });
    stage.register(analise);
    return analise;
};

module.exports = analise;