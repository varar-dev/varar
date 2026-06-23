#!/usr/bin/env node
import { ProposedFeatures, createConnection } from 'vscode-languageserver/node.js'
import { registerHandlers } from './server.js'

const connection = createConnection(ProposedFeatures.all)
registerHandlers(connection)
connection.listen()
