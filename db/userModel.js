const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, "Please provide a username!"],
        unique: [true, "User exists in database."],
    },

    password: {
        type: String,
        required: [true, "Please provide a password!"],
        unique: false,
    },

    groupName: {
        type: String,
        required: [true, "Please provide a group name!"],
        unique: false,
    }
})

module.exports = mongoose.model.Users || mongoose.model("Users", UserSchema);

