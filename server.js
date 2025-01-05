/*********************** REQUIREMENTS **********************/
const express = require("express");
const app = express();
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const { JSDOM } = require('jsdom');

if (process.argv.length !== 2) {
    console.log("Usage node server.js");
    process.exit(1); 
}

app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");
app.use(express.static("templates"));

app.use(express.urlencoded({ extended: true }));

/******************* GLOBAL VARIABLES **************************/
let currUser = null;

/*********************** ENDPOINTS **********************/
/******** INDEX/LOGIN ********/
app.get("/", (request, response) => {
	response.render("index");
});

app.post("/", (request, response) => {
    const variables = {
        user:request.body.username,
        pass:request.body.password
    };
    // Read the 'user.account' file
    fs.readFile(`accounts/${variables.user}.account`, "utf8", (err, data) => {
        if (err) {
            return response.send(`<script>alert("Incorrect username");window.location.href = '/';</script>`);
        }

        // Extract the stored username and password hash
        const lines = data.split("\n");
        const username = lines[0]; // Extract username
        const storedPass = lines[1]; // Extract hashed password
        const hashedPassword = crypto.createHash("sha256").update(variables.pass).digest("hex");

        if (variables.user === username && hashedPassword === storedPass) {
            currUser = variables.user;
            response.render("userhub", {currUser});
        } else {
            response.send(`<script>alert("Incorrect username or password");window.location.href = '/';</script>`);
        }
    });
});

/******** CREATE USER ********/
app.get("/createUser", (request, response) => {
	response.render("createUser");
});

app.post("/createUser", (request, response) => {
    const variables = {
        user:request.body.username,
        pass:request.body.password
    };

    // Hash the password using SHA256
    const hashedPassword = crypto.createHash("sha256").update(variables.pass).digest("hex");

    // Create the content to write to the file
    const fileContent = `${variables.user}\n${hashedPassword}\n`;

    // Write to the 'user.account' file
    if (fs.existsSync(`accounts/${variables.user}.account`)) {
        console.log(`Error: Username already exists.`);
        response.send(`<script>alert("Username already in use");window.location.href = '/createUser';</script>`);
    } else {    
        fs.writeFile(`accounts/${variables.user}.account`, fileContent, (err) => {
            if (err) {
                console.error("Error writing to file:", err);
                return response.status(500).send("Error creating user file.");
            }

            console.log("User file created successfully.");
        });

        // Write to the user.holdings file
        fs.writeFile(`holdings/${variables.user}.holdings`, "", (err) => {
            if (err) {
                console.error("Error writing to file:", err);
                return response.status(500).send("Error creating user file.");
            }

            console.log("User file created successfully.");
        });
    }

	response.render("index");
});

/******** DASHBOARD ********/
app.get("/dashboard", (request, response) => {
    let currentHoldings = "<table><th>Name</th><th>Quantity</th><th>Base Price</th><th>Base Position</th><th>Current Position</th><th>Gain/Loss</th>";

    fs.readFile(`holdings/${currUser}.holdings`, "utf8", (err, data) => {
        if (err) {
            console.error("Error reading the file:", err);
            return response.status(500).send("Error accessing user data.");
        }

        const lines = data.split("\n");

        lines.forEach(line => {
            currentHoldings += `<tr>${line}</tr>`;
        });

        /* Add totals row */
        let totalBasePos = 0;
        let totalCurrPos = 0;
        let totalGain = 0;

        const dom = new JSDOM(`<table>${currentHoldings}</table>`);
        const document = dom.window.document;

        document.querySelectorAll('tr').forEach(row => {
            /* Total Base Position */
            let holdingCell = row.querySelectorAll('td')[3]; // 4th column is index 3
          
            if (holdingCell) {
              totalBasePos += parseFloat(holdingCell.textContent.trim());
            }

            /* Total Current Position */
            holdingCell = row.querySelectorAll('td')[4]; // 4th column is index 3
          
            if (holdingCell) {
              totalCurrPos += parseFloat(holdingCell.textContent.trim());
            }

            /* Total Gain/Loss */
            holdingCell = row.querySelectorAll('td')[5]; // 4th column is index 3
          
            if (holdingCell) {
              totalGain += parseFloat(holdingCell.textContent.trim());
            }
        });
          
        currentHoldings += `<tr><td><strong>TOTALS</strong></td><td></td><td></td><td><strong>${totalBasePos.toFixed(2)}\
        </stong></td><td><strong>${totalCurrPos.toFixed(2)}</strong></td><td><strong>${totalGain.toFixed(2)}</strong></td><tr>`

        currentHoldings += "</table>"

        response.render("dashboard", { currentHoldings });
    });
});

app.post("/dashboard", async (request, response) => {
    fs.readFile(`holdings/${currUser}.holdings`, "utf8", async (err, data) => {
        if (err) {
            console.error("Error reading the file:", err);
            return response.status(500).send("Error accessing user data.");
        }
        let updatedHoldings = "";

        const lines = data.split("\n");
        /* Check if the last line is empty and remove it */
        if (lines[lines.length - 1] === "") {
            lines.pop();
        }

        for (const line of lines) {
            expanded = line.split("<td>");

            let name, quantity, basePrice, basePosition, currPosition, gainLoss;
            name = expanded[1].split("</td>")[0];
            quantity = Number(expanded[2].split("</td>")[0]);
            basePrice = Number(expanded[3].split("</td>")[0]).toFixed(2);
            basePosition = Number(expanded[4].split("</td>")[0]).toFixed(2);
            
            /* Update curr price */
            var quote = await quoteHolding(name);
            currPrice = quote > 0 ? quote : Number(expanded[3].split("</td>")[0]);
            console.log(`CURR PRICE ${quote}`);
            currPosition = Number(quantity * currPrice).toFixed(2);
            gainLoss = Number(currPosition - basePosition).toFixed(2);

            updatedHoldings += `<tr><td>${name}</td><td>${quantity}</td><td>${basePrice}</td><td>${basePosition}</td>\
            <td>${currPosition}</td><td>${gainLoss}</td></tr>\n`;
        }

        fs.writeFile(`holdings/${currUser}.holdings`, updatedHoldings, (err) => {
            if (err) {
                console.error('Error writing to file:', err);
                return;
            }
            console.log('Content successfully updated!');
        });

        response.render("userhub", { currUser });
    });
});

/******** User Hub ********/
app.get("/userhub", (request, response) => {
	response.render("userhub", { currUser });
});

/******** Profile ********/
app.get("/profile", (request, response) => {
	response.render("profile");
});

app.post("/profile", (request, response) => {
    variables = {
        old:request.body.currPass,
        new:request.body.newPass
    };

    let newInfo = null;
    let valid = true;

    fs.readFile(`accounts/${currUser}.account`, "utf8", (err, data) => {
        if (err) {
            console.error("Error reading the file:", err);
            return response.status(500).send("Error accessing user data.");
        }

        // Extract the password
        const lines = data.split("\n");
        const storedPass = lines[1]; 
        const oldHash = crypto.createHash("sha256").update(variables.old).digest("hex");
        const newHash = crypto.createHash("sha256").update(variables.new).digest("hex");

        /* Make sure old pass is same as stored pass */
        if ((oldHash !== storedPass) || variables.new === "") {
            valid = false;
        }

        newInfo = lines[0] + "\n" + newHash;

        if (valid) {
            fs.writeFile(`accounts/${currUser}.account`, newInfo, (err) => {
                if (err) {
                    console.error("Error writing to file:", err);
                    return response.status(500).send("Error creating user file.");
                }
        
                console.log("Password updated successfully");
                response.render("index");
            });
        } else {
            response.send(`<script>alert("Error changing password");window.location.href = '/profile';</script>`);
        }
        });
});

/******** Log Out ********/
app.get("/logOut", (request, response) => {
    currUser = null;
    response.render("index");
});

/******** Add Holding ********/
app.get("/addHolding", (request, response) => {
    response.render("addHolding");
});

app.post("/addHolding", (request, response) => {
    const name = request.body.name;
    const quantity = Number(request.body.quantity);
    const basePrice = Number(request.body.basePrice).toFixed(2);
    const basePosition = (quantity * basePrice).toFixed(2);
    const currPosition = Number(request.body.currPosition).toFixed(2);
    const gainLoss = (currPosition - basePosition).toFixed(2);

    const newHolding = `<tr><td>${name}</td><td>${quantity}</td><td>${basePrice}</td><td>${basePosition}</td>\
    <td>${currPosition}</td><td>${gainLoss}</td></tr>\n`;

    fs.appendFile(`holdings/${currUser}.holdings`, newHolding, (err) => {
        if (err) {
            console.error('Error appending to file:', err);
            return;
        }
        console.log('Content successfully appended!');
    });

    response.render("userHub", { currUser });
});

/******** Remove Holding ********/
app.get("/removeHolding", (request, response) => {
    response.render("removeHolding");
});

app.post("/removeHolding", (request, response) => {
    const name = request.body.name;

    fs.readFile(`holdings/${currUser}.holdings`, "utf8", (err, data) => {
        if (err) {
            console.error("Error reading the file:", err);
            return response.status(500).send("Error accessing user data.");
        }

        const lines = data.split("\n");
        let newlines = "";

        /* Holding found? */
        let found = false;

        lines.forEach((line) => {
            if (line.includes(`<td>${name}</td>`)) {
                found = true;
            } else {
                newlines += line;
            }
        });

        if (!found) {
            return response.send(`<script>alert("${name} not current holding");window.location.href = '/removeHolding';</script>`)
        } else {    
            fs.writeFile(`holdings/${currUser}.holdings`, newlines, (err) => {
                if (err) {
                    console.error("Error writing to file:", err);
                    return response.status(500).send("Error removing holding.");
                }
        
                console.log("Holding removed successfully");
                response.render("userhub", { currUser });
            });
        }
    });
});

/*********************** SERVER CONTROL **********************/
const portNumber = 5001
app.listen(portNumber, () => {
	console.log(`Web server is running at http://localhost:${portNumber}`);
	console.log("Stop to shut down the server: ");
});

process.stdin.setEncoding("utf8");
process.stdin.on('readable', () => {
	const dataInput = process.stdin.read();
	if (dataInput !== null) {
		const command = dataInput.trim();
		if (command === "stop") {
			console.log("Shutting down the server");
			process.exit(0);
		} else {
			console.log(`Invalid command: ${command}`);
		}
		process.stdin.resume();
	}
});

/*********************** API CONTROL **********************/
var request = require('request');
const API_KEY = "CRWUZWLN31MAKDY3";

function quoteHolding(symbol) {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    return new Promise((resolve, reject) => {
        request.get(
            {
                url: url,
                json: true,
                headers: { 'User-Agent': 'request' },
            },
            (err, res, data) => {
                if (err) {
                    console.error('Error:', err);
                    return resolve(0); // Return 0 if there’s an error
                }
                if (res.statusCode !== 200) {
                    console.error('Status:', res.statusCode);
                    return resolve(0);
                }
                try {
                    const price = Number(data['Global Quote']['05. price']).toFixed(2);
                    resolve(price); // Resolve the Promise with the price
                } catch {
                    resolve(0); // Return 0 if parsing fails
                }
            }
        );
    });
}