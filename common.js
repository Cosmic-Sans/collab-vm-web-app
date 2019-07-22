const runtime = require("runtime");
import Module from "collab-vm-web-app";

import $ from "jquery";

import "semantic-ui";
import "semantic-ui.css";

const rootPath = __webpack_public_path__;
if (!(window.location.pathname + "/").startsWith(rootPath)) {
  console.error(`Content must be located at '${rootPath}'.`);
}

if (__DEV__) {
  require("expose-loader?common!common");
  require("expose-loader?$!jquery");
  require("expose-loader?em!collab-vm-web-app");
  console.debug("__DEV__ enabled");
}

const routers = [];
const registerUrlRouter = router => {
  routers.push(router);
};
const setUrl = url => {
  const handledRouter = routers.find(router => router(url));
};
let serializer = {connected: false};
const getSocket = () => serializer;

const messageHandlers = {};
const addMessageHandlers = handlers => {
  Object.assign(messageHandlers, handlers);
};

const setClassProperties = (obj, props) => {
  Object.entries(props).forEach(keyVal =>
    obj["set" + keyVal[0][0].toUpperCase() + keyVal[0].substr(1)](keyVal[1]));
  return obj;
};
const createObject = (name, properties) => {
  return setClassProperties(new Module[name], properties || {});
};
const saveSessionInfo = (sessionId, username) => {
  localStorage["sessionId"] = sessionId;
  localStorage["username"] = username;
};
const loadSessionInfo = () => {
  return {sessionId: localStorage["sessionId"], username: localStorage["username"]};
};
export { registerUrlRouter, setUrl, getSocket, addMessageHandlers, createObject, saveSessionInfo, loadSessionInfo };

runtime.onRuntimeInitialized(() => {

  serializer = Object.assign(Module.Serializer.implement({
    onMessageReady: message =>
    {
      webSocket.send(message);
    }
  }), serializer);

  $(() => {
    const path = window.location.pathname.substr(rootPath.length - 1);
    setUrl(path ? path : "/");
  });

  let webSocket;
  const deserializer = Module.Deserializer.implement(messageHandlers);

  function connectWebSocket() {
    webSocket = new WebSocket("ws://" + WEBSOCKET_ADDRESS);
    webSocket.binaryType = "arraybuffer";
    let connected = false;
    webSocket.onopen = () => {
      connected = true;
      serializer.connected = true;
      if (serializer.onConnect) {
        serializer.onConnect();
      }
    };
    webSocket.onmessage = ({data}) => deserializer.deserialize(data);
    webSocket.onclose = () => {
      if (connected) {
        if (serializer.onDisconnect) {
          serializer.onDisconnect();
        }
        connected = false;
        connectWebSocket();
      } else {
        setTimeout(connectWebSocket, 5000);
      }
    };
  }

  connectWebSocket();
});
