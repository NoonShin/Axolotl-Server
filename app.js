const {ChangeSet, Text} = require("@codemirror/state")
const express = require("express");
const cors = require("cors");
const fs = require('fs');
const socket = require("socket.io")
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require('dotenv').config()
const dbConnect = require("./db/dbConnect");
const User = require("./db/userModel");
const auth = require("./auth");
const path = require("path");
const axios = require("axios");
const bodyParser = require("express");

dbConnect();

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json()); // support json encoded bodies
app.use(express.urlencoded({ extended: true })); // support encoded bodies


const server = app.listen(process.env.PORT, () => {
  console.log(`Express server is running on port ${process.env.PORT}.`);
});

// register endpoint
app.post("/register", (request, response) => {
    bcrypt
        .hash(request.body.password, 10)
        .then((hashedPassword) => {
            const user = new User({
                username: request.body.username,
                password: hashedPassword,
                groupName: request.body.groupName
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
    // check if username exists
    User.findOne({ username: request.body.username })
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
                            username: user.username,
                            groupName: user.groupName
                        },
                        process.env.JWT_SECRET,
                        { expiresIn: "48h" }
                    );

                    response.status(200).send({
                        message: "Login Successful.",
                        username: user.username,
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

app.get("/image", auth, (request, response) => {
    // console.log(request.user)
    response.sendFile(path.join(__dirname, 'files', 'oxen.jpg'))
});

app.post('/transkribus-proxy', async (req, res) => {
    try {
        const params = new URLSearchParams({ user: req.body.user, pw: req.body.pw });
        const response = await axios.post('https://transkribus.eu/TrpServer/rest/auth/login', params)

        // not sure if this is best practice to send cookie in response body
        if (response.status === 200) {
            res.cookie('trCookie', response.headers['set-cookie'][0].split(';')[0])
            res.status(200).send({
                data: response.headers['set-cookie'][0].split(';')[0]
            });
        }

    } catch (error) {
        console.log(error);
        res.status(500).send(error);
    }
});

const room1data = fs.readFileSync('./files/oxen.xml', 'utf8');
const room2data = fs.readFileSync('./files/sample1.xml', 'utf8');
const room3data = fs.readFileSync('./files/sample2.xml', 'utf8');
const basicDoc = fs.readFileSync('./files/sample2.xml', 'utf8');
let roomDict = {
    'one' : {
        'mirrorDoc': Text.of([room1data]),
        'updatesLog': []
    },
    'two' : {
        'mirrorDoc': Text.of([basicDoc]),
        'updatesLog': []
    },
    'three' : {
        'mirrorDoc': Text.of([basicDoc]),
        'updatesLog': []
    },
    'four' : {
        'mirrorDoc': Text.of([basicDoc]),
        'updatesLog': []
    },
    'five' : {
        'mirrorDoc': Text.of([basicDoc]),
        'updatesLog': []
    }
}


// const data = fs.readFileSync('./files/oxen.xml', 'utf8');
// App setup
// const PORT = 5000;
// const socketApp = express();
// const server = socketApp.listen(PORT, function () {
//     console.log(`Socket server is running on port ${PORT}.`);
// });
//
// // Static files
// socketApp.use(express.static("public"));
// socketApp.use(cors);

// Socket setup
const io = socket(server, {
    cors: {
        origin: '*'
    },
    // these options should not be necessary
    pingTimeout: 60000,
    maxHttpBufferSize: 1e10
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
        socket.join(socket.decoded.groupName);
        console.log("Made socket connection " + socket.id + ' ' + socket.decoded.username);
        socket.emit("firstVersion", roomDict[socket.decoded.groupName].mirrorDoc.toString(), roomDict[socket.decoded.groupName].updatesLog.length)

        socket.on("pushUpdates", async (version, updates) => {
            if (version === roomDict[socket.decoded.groupName].updatesLog.length) {
                for (let update of updates) {
                    let changes = ChangeSet.fromJSON(update.changes);
                    // console.log(changes)
                    roomDict[socket.decoded.groupName].updatesLog.push({changes, clientID: update.clientID});
                    // console.log(updatesLog.length)
                    roomDict[socket.decoded.groupName].mirrorDoc = changes.apply(roomDict[socket.decoded.groupName].mirrorDoc)
                    // console.log(mirrorDoc)
                    io.to(socket.decoded.groupName).emit("newVersion", [{changes, clientID: update.clientID}]);
                }
            } else {
                console.log("Version conflict: update log says " + roomDict[socket.decoded.groupName].updatesLog.length + " while version is " + version)
            }
        });

        socket.on("newSelection", (selection) => {
            console.log(selection)
        });

        socket.on('disconnect', () => {
            console.log('user ' + socket.id + ' ' + socket.decoded.username + ' disconnected');
        });
    });


