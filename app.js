require("dotenv").config()
const express = require("express")
const app = express()
const port = process.env.PORT || 3001
const cors = require("cors")
const corsOptions = {
    origin: "*",
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

const { GraphQLClient, gql } = require("graphql-request")
const {JSONPath} = require("jsonpath-plus");


const API_URL = "https://www.warcraftlogs.com/api/v2/client/"
const FILTER_DPS_PATH = "$.reportData.report.table.data.entries[*][name,total]"
const FILTER_ID_PATH = "$.reportData.report.fights[*]"
const FILTER_TIME_PATH = "$.reportData.report.table.data[totalTime,downtime]"

const WEAVING_FILTER = "ability.type = 32 AND IN RANGE FROM type = 'applydebuff' AND ability.id = 15258 TO type = 'removedebuff' AND ability.id = 15258 GROUP BY target END"
const MISERY_FILTER = "NOT ability.type = 1 AND IN RANGE FROM type = 'applydebuff' AND ability.id = 33200 TO type = 'removedebuff' AND ability.id = 33200 GROUP BY target END"

const graphQLClient = new GraphQLClient(API_URL, {
    headers: {
        authorization: `Bearer ${process.env.TOKEN}`
    },
})


const trashQuery = gql`
        query getTrash($reportID: String!, $filter: String!) {
            reportData {
                report(code: $reportID) {
                    table(killType: Trash, dataType: DamageDone, endTime: 999999999, filterExpression: $filter)
                }
            }
        }`;

const idQuery = gql`
        query getTrash($reportID: String!) {
            reportData {
                report(code: $reportID) {
                    fights(killType: Kills) {
                        id
                        encounterID
                    }
                }
            }
        }`;

const bossQuery = gql`
        query getBoss($reportID: String!, $fightID: Int!, $filter: String!) {
            reportData {
                report(code: $reportID) {
                    table(fightIDs: [$fightID], dataType: DamageDone, endTime: 999999999, filterExpression: $filter)
                }
            }
        }`;

function convertToDict(weavingTable, miseryTable, id) {
    const weavingDamageArray = JSONPath({path: FILTER_DPS_PATH, json: weavingTable})
    var weavingDamageDict = {}
    var weavingTotal = 0
    for (let i = 1; i < weavingDamageArray.length; i+=2) {
        weavingDamageDict[weavingDamageArray[i-1]] = weavingDamageArray[i]
        weavingTotal += weavingDamageArray[i]
    }

    const miseryDamageArray = JSONPath({path: FILTER_DPS_PATH, json: miseryTable})
    var miseryDamageDict = {}
    var miseryTotal = 0
    for (let i = 1; i < miseryDamageArray.length; i+=2) {
        miseryDamageDict[miseryDamageArray[i-1]] = miseryDamageArray[i]
        miseryTotal += miseryDamageArray[i]
    }

    const timeArr = JSONPath({path: FILTER_TIME_PATH, json: weavingTable})
    const time = timeArr[0] - (timeArr[1] ?? 0)

    let fight = {}
    let weaving = {}
    let misery = {}
    fight.id = id
    fight.time = time

    weaving.totalDamage = weavingTotal
    weaving.damageDone = weavingDamageDict
    misery.totalDamage = miseryTotal
    misery.damageDone = miseryDamageDict
    
    fight.weaving = weaving
    fight.misery = misery

    return fight
}
        
app.get("/", (req, res) => {
    res.send("White shadow caster 白色阴影投射器 Improve dark damage 提高暗伤害 Mana fountain 法力喷泉 Dog staff priority 狗工作人员优先")
})

app.get("/report/:link", async (req, res) => {
    try {
        const reportID = req.params.link
        const weavingTrashTable = await graphQLClient.request(trashQuery, {reportID: reportID, filter: WEAVING_FILTER})
        const miseryTrashTable = await graphQLClient.request(trashQuery, {reportID: reportID, filter: MISERY_FILTER})
        const bossFights = await graphQLClient.request(idQuery, {reportID: reportID})
        const bossArray = JSONPath({path: FILTER_ID_PATH, json: bossFights})
        var results = []
        
        await Promise.all(bossArray.map(async (fight) => {
            const weavingTable = await graphQLClient.request(bossQuery, {reportID: reportID, fightID: parseInt(fight.id), filter: WEAVING_FILTER})
            const miseryTable = await graphQLClient.request(bossQuery, {reportID: reportID, fightID: parseInt(fight.id), filter: MISERY_FILTER})
            results.push(convertToDict(weavingTable, miseryTable, fight.encounterID))
        }))

        const trashResult = convertToDict(weavingTrashTable, miseryTrashTable, 0)
        results.push(trashResult)

        res.send(results)
    } catch (error) {
        res.status(400).send("Invalid URL or ID.")
    }
})

app.listen(port, () => {
    console.log(`SPAPI listening on port ${port}`)
})