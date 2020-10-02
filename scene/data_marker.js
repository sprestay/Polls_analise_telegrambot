const Markup = require('telegraf/markup');
const Extra = require('telegraf/extra');
const Scene = require('telegraf/scenes/base');
const WizardScene = require("telegraf/scenes/wizard");
const Quest = require('../db_models/question');
const Model = require('../db_models/model');
const { NlpManager } = require('node-nlp');
const fs = require('fs');
var data = require('../index');
const { all } = require('async');

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
let model_list_was_printed = false; //Уже показывали список доступных моделей
let models = [];
let selected_model = null;
let all_categories_of_new_model = [];
let model_name = null;

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
    let result = [[Markup.callbackButton('➤ Пропустить ➤', 'skip')]]; // Базовая кнопка "Пропустить ответ"
    let subresult = [];
    for (let i = 0; i < cat.length; i++) {
        subresult.push(Markup.callbackButton(cat[i], cat[i])); //в первой строке будет 5 кнопок
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
    
    async (ctx) => { // Выбор моделей. Показываем список моделей, в которую пользователь хочет интегрироваться
        if (!model_list_was_printed) {
            models = await Model.find({});
            console.log("models", models);
            if (models.length != 0) {
                for (let model of models) {
                    let msg = `<b>${model.name}</b>\n
                    <i>автор ${model.author}</i>\n
                    ${model.description ? model.description + '\n' : ''}
                    Поддерживает следующие критерии\n
                    _______________________________\n
                    ${model.categories.join(', ')}
                    `
                    ctx.replyWithHTML(msg, {
                        reply_markup: {
                            inline_keyboard: [[Markup.callbackButton('Выбрать', model.id)]]
                        }
                    });
                }
                model_list_was_printed = true;
                ctx.reply("Выбери нужную модель, или нажми пропустить", {
                    reply_markup: {
                        inline_keyboard: [[Markup.callbackButton("Пропустить", 'skip')]]
                    }
                })
            } else {
                ctx.reply("Готовых моделей нет - будешь первым!\nВведи название модели");
                return ctx.wizard.next();
            }
        } else {
            selected_model = ctx.update.callback_query.data;
            ctx.reply("Модель выбранна. Чтобы случайно не испортить данные, создадим сначала копию. Введи название своей модели");
            return ctx.wizard.next();
        }
    },
    async (ctx) => { // Подготовительная сцена - делаем предварительные расчеты, показываем базовую информацию
        data = data.result; // Импорты происходят ДО вызова функции, поэтому значение required(../index).result будет {}
        question_list = Object.keys(data);

        model_name = ctx.message.text;
        let question = question_list[question_indx]; // Добавить проверку на границы массива
        answer_list = data[question];
        shuffle(answer_list);

        await ctx.replyWithHTML(`
        <b>${question}</b>\n
        Всего ответов - ${data[question].length}\n
        Укажи долю выборки для разметки (в процентах), или
        `, {
            reply_markup: {
                inline_keyboard: [[Markup.callbackButton('Выбрать автоматически', 'auto')]]
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => { // В этом блоке мы определяем размер выборки

        let msg = ctx.update.callback_query ? ctx.update.callback_query.data : ctx.message.text.trim().toLowerCase();

        if (msg != 'auto' && Number(msg) && Number(msg) > 0 && Number(msg) <= 100) 
            amount = Math.ceil(data[question_list[question_indx]].length * (Number(msg) / 100));
        else if (msg == 'auto')
            amount = stupid_size_detector(data[question_list[question_indx]].length);
        else {
            ctx.reply("Что-то ты не то ввел", {
                reply_markup: {
                    inline_keyboard: [[Markup.callbackButton('Выбрать автоматически', 'auto')]]
                }
            }).then(res => previous = res.message_id);
            return;
        }
        ctx.deleteMessage(previous);
        ctx.replyWithHTML(`
        Размечать будем - ${amount} ответа\n
        Правила следующие: я пишу ответ - ты пишешь категорию, к которой хочешь этот ответ отнести. Все просто)\n
        Начали!\n
        ----------\n
        `);
        ctx.reply(answer_list[answer_indx],{
            reply_markup: {
                inline_keyboard: buttons_genenrator(),
            }
        }).then(res => previous = res.message_id);
        answer_indx++;
        return ctx.wizard.next();
    },
    // Главная функция для разметки.
    // 2 цикла - по вопросам и по ответам. 
    async (ctx) => {
        let msg = ctx.update.callback_query ? ctx.update.callback_query.data : ctx.message.text.trim().toLowerCase();

        if (!categories.hasOwnProperty(msg) && msg != 'skip') {
            categories[msg] = [];
            if (all_categories_of_new_model.indexOf(msg) == -1) // Добавляем категорию в список для сохранения в модель
                all_categories_of_new_model.push(msg);
        }
        if (msg != 'skip') { // Если не "Пропустить ответ". Можно увеличивать счетчик вопросов для разметки на 1. Необходимо фильтровать данные
            categories[msg].push(answer_list[answer_indx - 1]);
            manager.addDocument('ru', answer_list[answer_indx - 1], msg); //Добавляем в модель для обучения.
        } else 
            data[question_list[question_indx]] = data[question_list[question_indx]].filter(item => item != answer_list[answer_indx - 1]);
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
                categories = {}
                let question = question_list[question_indx]; // Добавить проверку на границы массива
                answer_list = data[question];
                shuffle(answer_list);
                await ctx.replyWithHTML(`
                Следующий вопрос:\n
                <b>${question}</b>\n
                Всего ответов - ${data[question].length}\n
                Укажи долю выборки для разметки (в процентах), или
                `, {
                    reply_markup: {
                        inline_keyboard: [[Markup.callbackButton('Выбрать автоматически', 'auto')]]
                    }
                });
                return ctx.wizard.back();
            } else { // Вопросов больше нет.
                await ctx.replyWithHTML(`
                Разметку окончили.
                Обучаем модель. Это может занять некоторое время.

                <b>Я отпишу, когда закончу</b>
                `);
                await manager.train();
                let model_id = Math.round(Date.now() / 1000).toString();
                let user_id = ctx.update.callback_query ? ctx.update.callback_query.from.id : ctx.message.from.id;
                await Model.create({
                    id: model_id,
                    name: model_name,
                    description: "some_text", //если есть совпадающие категории - будет дубль. Имеет смысл предлагать пользователю готовые категории. Пересмотреть категории - единые для все вопросов
                    categories: selected_model ? models.filter(item => item.id == selected_model)[0].categories.concat(all_categories_of_new_model) : all_categories_of_new_model, 
                    model_status: selected_model ? 'updated' : 'new',
                    author: user_id,
                });
                manager.save('./models/' + model_id + '.nlp');

                await ctx.reply("Готово!", {
                    reply_markup: {
                        inline_keyboard: [[Markup.callbackButton('Анализ', 'analise')]],
                    }
                });
                return ctx.wizard.next();
            }
        }
        answer_indx++;
    }, 
    async ctx => {
        if (ctx.update.callback_query && ctx.update.callback_query.data == 'analise')
            await ctx.scene.enter('analiseScene');
        else
            ctx.reply("Не понял тебя"); 
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