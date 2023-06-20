const {ChangeSet, Text} = require("@codemirror/state")
const express = require("express");
const cors = require("cors");
const fs = require('fs');
const socket = require("socket.io");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require('dotenv').config()
const dbConnect = require("./db/dbConnect");
const User = require("./db/userModel");
const auth = require("./auth");

dbConnect();

const app = express();
app.use(cors());
app.use(express.json());

app.listen(8000, () => {
  console.log(`Express server is running on port 8000.`);
});

// register endpoint
app.post("/register", (request, response) => {
    bcrypt
        .hash(request.body.password, 10)
        .then((hashedPassword) => {
            const user = new User({
                email: request.body.email,
                password: hashedPassword,
            });

            user
                .save()
                .then((result) => {
                    response.status(201).send({
                        message: "User created successfully.",
                        result,
                    });
                })
                .catch((error) => {
                    response.status(500).send({
                        message: "Error creating user.",
                        error,
                    });
                });
        })
        .catch((e) => {
            response.status(500).send({
                message: "Password was not hashed successfully.",
                e,
            });
        });
});

// login endpoint
app.post("/login", (request, response) => {
    // check if email exists
    User.findOne({ email: request.body.email })
        .then((user) => {
            bcrypt
                .compare(request.body.password, user.password)

                .then((passwordCheck) => {

                    if(!passwordCheck) {
                        return response.status(400).send({
                            message: "Username or password incorrect.",
                            error,
                        });
                    }

                    const token = jwt.sign(
                        {
                            userId: user._id,
                            userEmail: user.email,
                        },
                        process.env.JWT_SECRET,
                        { expiresIn: "24h" }
                    );

                    response.status(200).send({
                        message: "Login Successful.",
                        email: user.email,
                        token,
                    });
                })
                .catch((error) => {
                    response.status(401).send({
                        message: "Username or password incorrect.",
                        error,
                    });
                });
        })
        .catch((e) => {
            response.status(401).send({
                message: "Username or password incorrect.",
                e,
            });
        });
});


const data = fs.readFileSync('./files/oxen.xml', 'utf8');
let mirrorDoc = Text.of([data]);
const updatesLog = []
// App setup
const PORT = 5000;
const socketApp = express();
const server = socketApp.listen(PORT, function () {
    console.log(`Socket server is running on port ${PORT}.`);
});

// Static files
socketApp.use(express.static("public"));
socketApp.use(cors);

// Socket setup
const io = socket(server, {
    cors: {
        origin: '*'
    }
});

io.use(function(socket, next){
    // If client wants to connect they must have auth
    if (socket.handshake.query && socket.handshake.query.token){
        jwt.verify(socket.handshake.query.token, process.env.JWT_SECRET, function(err, decoded) {
            if (err) return next(new Error('Authentication error'));
            socket.decoded = decoded;
            next();
        });
    }
    else {
        next(new Error('Authentication error'));
    }
})
    .on('connection', function(socket) {
        // Connection now authenticated to receive further events

        console.log("Made socket connection " + socket.id + ' ' + socket.decoded.userEmail);
        socket.emit("firstVersion", mirrorDoc.toString(), updatesLog.length)

        socket.on("pushUpdates", (version, updates) => {
            if (version === updatesLog.length) {
                for (let update of updates) {
                    let changes = ChangeSet.fromJSON(update.changes);
                    // console.log(changes)
                    updatesLog.push({changes, clientID: update.clientID});
                    // console.log(updatesLog.length)
                    mirrorDoc = changes.apply(mirrorDoc)
                    // console.log(mirrorDoc)
                    io.emit("newVersion", [{changes, clientID: update.clientID}]);
                }
            }
            else {
                console.log("Version conflict: update log says " + updatesLog.length + " while version is " + version)
            }
        });

        socket.on('disconnect', () => {
            console.log('user ' + socket.id + ' ' + socket.decoded.userEmail + ' disconnected');
        });
    });


