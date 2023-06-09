const fs = require("fs");    //Allows to work with the file system on your computer.
const http = require("http");  //Allows Node.js to transfer data over the Hyper Text Transfer Protocol (HTTP)
const url = require("url");  //Splits up a web address into readable parts
const opn = require("open");   //Open stuff like URLs, files, executables
const destroy = require("server-destroy");  // Enable destroying a server, and all currently open connections
const { google } = require("googleapis");  //Authorization and authentication with OAuth 2.0, API Keys

// Google Auth Credentials from json
const keys = {
  installed: {
    client_id:
      "",                       // Enter Client ID here
    project_id: "mail-389204",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_secret: "",                        // Enter Client Secret ID Here
    redirect_uris: ["http://localhost:3000/oauth2callback"],
  },
};

// Get refersh token
let refreshToken =
  "";                             //Enter Refresh Toekn here by running the app for the first time

const oauth2Client = new google.auth.OAuth2(
  keys.installed.client_id,
  keys.installed.client_secret,
  keys.installed.redirect_uris[0]
);

google.options({ auth: oauth2Client });

// Send User prompt to sign up for the app and get required Permisions then store the refresh tokens
async function authenticate(scopes) {
  return new Promise((resolve, reject) => {
    // grab the url that will be used for authorization
    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes.join(" "),
    });

    const server = http
      .createServer(async (req, res) => {
        try {
          if (req.url.indexOf("/oauth2callback") > -1) {
            const qs = new url.URL(req.url, "http://localhost:3000")
              .searchParams;
            res.end("Authentication successful! Please return to the console.");
            server.destroy();
            const { tokens } = await oauth2Client.getToken(qs.get("code"));
            console.log(tokens.refresh_token);
            oauth2Client.credentials = tokens;
            resolve(oauth2Client);
          }
        } catch (e) {
          reject(e);
        }
      })
      .listen(3000, () => {
        // opn(authorizeUrl, { app: { name: "chrome" } });
        // open the browser to the authorize url to start the workflow
        opn(authorizeUrl, { wait: true }).then((cp) => cp.unref());
      });
    destroy(server);
  });
}

// Lists the OAuth 2.0 scopes that you might need to request to access Google APIs
const scopes = [
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/user.emails.read",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
];

// Creating a Reply
const sendReply = async (gmail, to, messsageReference, subject, threadId) => {
  const messageParts = [
    `threadId: ${threadId}`,
    `References: ${messsageReference}`,
    `In-Reply-To: ${messsageReference}`,
    `Subject:${subject} `,
    "From: example@gmail.com",
    `To: ${to}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    "Hi am on Vacation, will get back to you soon. Thank You",
  ];
  const message = messageParts.join("\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sendStatus = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: threadId,
    },
  });
  return sendStatus.data;
};

const addLabel = async (gmail, messageId) => {
  //  console.log((await gmail.users.labels.list({userId:"me"})).data) // -> all labeles -> id [Label_2205134339257950949]
  const res = await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: ["Label_4899549421532410220"],
      removeLabelIds: ['UNREAD']
    },
  });
};

// Main Function
async function checkUnreadAndReply() {
  // Geting the gauth Client
  let client;
  if (refreshToken == "") {
    client = await authenticate(scopes);
  } else {
    client = oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
  }

  // Gmail Client
  const gmail = google.gmail({ version: "v1", auth: client });
  // addLabel(gmail);

  // Geting list of messages with filters
  let res = await gmail.users.messages.list({
    userId: "me",
    q: "in:inbox is:unread from:abcxyz@gmail.com",
  });

  // Check if there are result
  if (res.data.resultSizeEstimate !== 0) {
    let threads = res.data.messages;

    for (let i = 0; i < threads.length; i++) {
      // Getting indiviudal Message
      let msg = await gmail.users.messages.get({
        userId: "me",
        id: threads[i].id,
      });

      // check if already replied
      if (
        msg.data.payload.headers.filter((header) => header.name === "From")
          .length === 1
      ) {
        // Senders Email
        let from = msg.data.payload.headers.find((ele) => ele.name === "From");
        // Message Id
        let reference = msg.data.payload.headers.find(
          (ele) => ele.name === "Message-ID"
        );

        // Subject
        let sub = msg.data.payload.headers.find(
          (ele) => ele.name === "Subject"
        );

        let sendData = await sendReply(
          gmail,
          from.value,
          reference.value,
          sub.value,
          threads[i].threadId
        );

        await addLabel(gmail, threads[i].id);

        console.log(`Replied To : ${from.value}`);
      }
    }
  } else {
    console.log("No Unread Messages Found");
  }

  // send a reply
}

// setInterval(checkUnreadAndReply, 1000 * 20000);

checkUnreadAndReply();
if(refreshToken !== ""){
  setInterval(checkUnreadAndReply, 1000 * 120);
}

