const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    id: {
        type: Number,
        required: true,
    },
    models: {
        type: Array,
    }
});

var User = mongoose.model('user', UserSchema);
module.exports = User;
