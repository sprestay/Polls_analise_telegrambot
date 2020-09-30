const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QuestSchema = new Schema({
    text: {
        type: String,
        required: true,
    },
    categories: {
        type: Object,
    }
});

var Quest = mongoose.model('question', QuestSchema);

module.exports = Quest;