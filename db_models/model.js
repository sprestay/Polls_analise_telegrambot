const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ModelSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
    },
    description: {
        type: String,
    },
    author: {
        type: Number,
    },
    categories: {
        type: Array,
    },
    model_status: {
        type: String, //Экспериментально. Некий флаг, который будет показывать что-то
    }
}); 

var Model = mongoose.model('model', ModelSchema);
module.exports = Model;