const Markup = require('telegraf/markup');
const Extra = require('telegraf/extra');
const Scene = require('telegraf/scenes/base');
const WizardScene = require("telegraf/scenes/wizard");
const Quest = require('../db_models/question');
const { NlpManager } = require('node-nlp');
const fs = require('fs');
var data = require('../index');

const manager = new NlpManager({ languages: ['ru'], nlu: { log: true } });
if (fs.existsSync('model.nlp'))
    manager.load('model.nlp');
// exports['manager'] = manager;

let categories = {}; // здесь сохраняем размеченные данные
let question_indx = 0;
let question_list = [];
let answer_indx = 0;
let answer_list = [];
let amount = 0;
let previous = null; // предыдущий ответ


const shuffle = array => { // Перемешать массив
    for (let i = array.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1)); 
      [array[i], array[j]] = [array[j], array[i]];
    }
}

const stupid_size_detector = total => { // Определяем размер выборки для обучения.
    let amount = total;
    switch(true) {
        case (total <= 100):
            amount = total <= 30 ? total : 30;
            break;
        case (total <= 250):
            amount = total * 0.2;
            break;
        case (total <= 500):
            amount = total * 0.15;
            break;
        default:
            amount = total * 0.1;
    }
    return Math.ceil(amount);
}

const buttons_genenrator = () => {
    let cat = Object.keys(categories);
    let result = [];
    let subresult = [];
    for (let i = 0; i < cat.length; i++) {
        subresult.push(Markup.callbackButton(cat[i], cat[i]));
        if (i % 4 == 0 && i != 0) {
            result.push(subresult);
            subresult = [];
        }
    };
    if (subresult.length != 0)
        result.push(subresult);
    return result;
}

function data_marker(stage) {
    const dataMarker = new WizardScene(
        'dataMarker',
    // Добавить пользователю возможность указывать объем выборки для разметки
    // Подготовительная сцена - делаем предварительные расчеты, показываем базовую информацию
     async (ctx) => {
        data = data.result; // Импорты происходят ДО вызова функции, поэтому значение required(../index).result будет {}
        question_list = Object.keys(data);

        // ctx.editMessageReplyMarkup(Extra.markup(Markup.removeKeyboard()));
        let question = question_list[question_indx]; // Добавить проверку на границы массива
        amount = stupid_size_detector(data[question].length);
        answer_list = data[question];
        shuffle(answer_list);

        await ctx.replyWithHTML(`
        <b>${question}</b>\n
        Всего вопросов - ${data[question].length}\n
        Размечать будем - ${amount}\n
        Правила следующие: я пишу ответ - ты пишешь категорию, к которой хочешь этот ответ отнести. Все просто)\n
        Начали!\n
        ----------\n
        `);
        ctx.reply(answer_list[answer_indx]).then(res => previous = res.message_id);
        answer_indx++;
        return ctx.wizard.next();
    },
    // Главная функция для разметки.
    // 2 цикла - по вопросам и по ответам. 
    async (ctx) => {
        let msg = ctx.update.callback_query ? ctx.update.callback_query.data : ctx.message.text.trim().toLowerCase();

        if (!categories.hasOwnProperty(msg))
                categories[msg] = [];
        categories[msg].push(answer_list[answer_indx - 1]);
        manager.addDocument('ru', answer_list[answer_indx - 1], msg); //Добавляем в модель для обучения.
        ctx.deleteMessage(previous);

        // Еще есть что размечать. 
        if (answer_indx < amount) {// Не сработает, если вопрос 1
            ctx.reply(answer_list[answer_indx], {
                reply_markup: {
                    inline_keyboard: buttons_genenrator(),
                }
            }).then(res => previous = res.message_id);
        } else { // Ответы закончились
            await Quest.create({text: question_list[question_indx], categories: categories});
            question_indx++;
            // У нас есть еще вопросы.
            if (question_indx < question_list.length) {
                answer_indx = 0;
                console.log("Разметка - ", categories);
                categories = {}
                let question = question_list[question_indx]; // Добавить проверку на границы массива
                amount = stupid_size_detector(data[question].length);
                answer_list = data[question];
                shuffle(answer_list);
                await ctx.replyWithHTML(`
                Следующий вопрос: - \n
                <b>${question_list[question_indx]}</b>
                `);
                ctx.reply(answer_list[answer_indx]).then(res => previous = res.message_id);

            } else { // Вопросов больше нет.
                await ctx.replyWithHTML(`
                Разметку окончили.
                Обучаем модель. Это может занять некоторое время.

                <b>Я отпишу, когда закончу</b>
                `);
                await manager.train();
                manager.save('model.nlp');
                await ctx.reply("Готово!", {
                    reply_markup: {
                        inline_keyboard: [[Markup.callbackButton('Анализ', 'analise')]],
                    }
                });
                await ctx.scene.enter('analiseScene');
            }
        }
        answer_indx++;
    }
);

    stage.register(dataMarker);
    return dataMarker;
}

module.exports = data_marker;


// {
//     'вопрос': {
//         'категория 1': [],
//         'категория 2': [],
//     }
// }