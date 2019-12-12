import {registerUrlRouter, setUrl, getSocket, addMessageHandlers, saveSessionInfo, loadSessionInfo} from "common";
import $ from "jquery";
import Guacamole from "Guacamole";
import {fromByteArray as ipFromByteArray} from "ipaddr.js";

let hasTurn = false;
let username = null;
let turnInterval = null;

registerUrlRouter(path => {
  if (path === "/") {
    viewServerList();
  } else if (path.startsWith("/view/")) {
    const vmId = path.substr("/view/".length);
    viewVm(+vmId);
  }
});

function viewVm(vmId) {
  const socket = getSocket();
  socket.sendConnectRequest(vmId);
}

const CollabVmTunnel = function() {
  this.sendMessage = () => {};
  this.connect = data => {
    this.setState(Guacamole.Tunnel.State.OPEN);
    this.sendMessage =
      (instr, ...args) => {
        const socket = getSocket();
        socket.sendGuacInstr(instr, args);
      }
  };
  this.disconnect = data => {
    this.setState(Guacamole.Tunnel.State.CLOSED);
  };
  //this.onerror = () => {};
};
CollabVmTunnel.prototype = new Guacamole.Tunnel();
const collabVmTunnel = new CollabVmTunnel();
const guacClient = new Guacamole.Client(collabVmTunnel);
const display = document.getElementById("display");
guacClient.getDisplay().getElement().addEventListener("mousedown", () => document.activeElement.blur());
guacClient.getDisplay().getElement().addEventListener("click", () => {
  if (!hasTurn) {
    getSocket().sendTurnRequest();
  }
});
const mouse = new ("ontouchstart" in document ?
              Guacamole.Mouse.Touchscreen :
              Guacamole.Mouse)(guacClient.getDisplay().getElement());
mouse.onmousedown = function(mouseState) {
  /*
  if (!focused)
    setFocus(true);
  */
  if (hasTurn) {
    guacClient.sendMouseState(mouseState);
  }
};
mouse.onmouseup =
  mouse.onmousemove = mouseState => {
    if (hasTurn) {
      guacClient.sendMouseState(mouseState);
    }
  };

const inputSink = new Guacamole.InputSink();
document.body.appendChild(inputSink.getElement());
const keyboard = new Guacamole.Keyboard(document);
keyboard.listenTo(inputSink.getElement());
keyboard.onkeydown = function(keysym) {
  if (hasTurn && [document.body, inputSink.getElement()].includes(document.activeElement)) {
    guacClient.sendKeyEvent(true, keysym);
    return false;
  }
  return true;
};
keyboard.onkeyup = function(keysym) {
  if (hasTurn && [document.body, inputSink.getElement()].includes(document.activeElement)) {
    guacClient.sendKeyEvent(false, keysym);
    return false;
  }
  return true;
};
window.onblur = keyboard.reset;

const maxChatMsgLen = 100;
$("#chat-input").keypress(function(e) {
  const enterKeyCode = 13;
  if (e.which === enterKeyCode) {
    e.preventDefault();
    $("#chat-send-btn").trigger("click");
  } else if (this.value.length >= maxChatMsgLen) {
    e.preventDefault();
  }
}).on("input", function() {
  // Truncate chat messages that are too long
  if (this.value.length > maxChatMsgLen) {
    this.value = this.value.substr(0, maxChatMsgLen);
  }
});

$("#chat-send-btn").click(function() {
  var chat = $("#chat-input");
  var msg = chat.val().trim();
  if (guacClient.currentState === Guacamole.Client.CONNECTED && msg) {
    getSocket().sendChatMessage(0, msg);
    chat.val("");
  }
});
$("#end-turn-btn").click(() => getSocket().endTurn());
$("#pause-turns-btn").click(() => getSocket().pauseTurnTimer());
$("#resume-turns-btn").click(() => getSocket().resumeTurnTimer());
$("#login-item").show().click(() => {
  $("#login-modal").modal({
    closable: true,
  }).modal("show");
});
$("#login-btn").click(() => {
  $("#login-status").text("");
  $("#login-btn").addClass("loading");
  getSocket().sendLoginRequest($("#username-box").val(), $("#password-box").val());
});

collabVmTunnel.onstatechange = function(state) {
  if (state == Guacamole.Tunnel.State.CLOSED) {
    //displayLoading();
  } else if (state == Guacamole.Tunnel.State.OPEN) {
    display.appendChild(guacClient.getDisplay().getElement());
  }
};

const vmContainer = $("#vm-container");
const $searchBox = $("#search-box");
const $officialCheckbox = $("#official-checkbox");
const $controlCheckbox  = $("#control-checkbox");
const $uploadsCheckbox  = $("#uploads-checkbox");
const $sfwCheckbox      = $("#sfw-checkbox");
const $filterCheckboxes = [$officialCheckbox, $controlCheckbox,
                           $uploadsCheckbox,  $sfwCheckbox];
const isIndeterminateOrEqual = (property, vm, criteria) =>
                                criteria[property] === null
                                || vm[property] === criteria[property];
const criteriaChecks = [
  (vm, criteria) => {
    if (!criteria.text) {
      return true;
    }
    const text = criteria.text.toLowerCase();
    return vm.name.toLowerCase().indexOf(text) !== -1
        || vm.host.toLowerCase().indexOf(text) !== -1;
  },
  (vm, criteria) => isIndeterminateOrEqual("official", vm, criteria),
  (vm, criteria) => isIndeterminateOrEqual("control",  vm, criteria),
  (vm, criteria) => isIndeterminateOrEqual("uploads",  vm, criteria),
  (vm, criteria) => isIndeterminateOrEqual("safeForWork",  vm, criteria)
];

const displayVmList = vms => {
  const images = Object.fromEntries(vmContainer.children().get().map(vm =>
    [vm.dataset.id, $(vm).find(".image img")]));
  vmContainer.empty();
  vms.forEach(vm => {
    vm.$element = $(
`<div class="ui card" data-id="${vm.id}">
   <div class="image">
   </div>
   <div class="content">
     <a class="header">${vm.name}</a>
     <div class="description">
       <ul class="ui list vm-info">
           ${vm.official ? '<div class="item"><i class="fas fa-check-circle" aria-hidden="true"></i> Official</li>' : ''}
           ${vm.control ? '<div class="item"><i class="fa fa-mouse-pointer" aria-hidden="true"></i> Mouse and Keyboard</li>' : ''}
           ${vm.uploads ? '<div class="item"><i class="fa fa-upload" aria-hidden="true"></i> File Uploads</li>' : ''}
           ${vm.safeForWork ? '<div class="item"><i class="fa fa-shield-alt" aria-hidden="true"></i> Safe for Work</li>' : ''}
           <div class="item"><i class="fab fa-windows" aria-hidden="true"></i> ${vm.os}</li>
           <div class="item"><i class="fa fa-archive" aria-hidden="true"></i> ${vm.ram} GiB RAM</li>
           <div class="item"><i class="fas fa-hdd" aria-hidden="true"></i> ${vm.disk} GiB Disk Space</li>
           <div class="item"><i class="fa fa-user" aria-hidden="true"></i> Hosted by ${vm.host}</li>
           <div class="item"><i class="fa fa-user" aria-hidden="true"></i> ${vm.viewerCount} Viewers</li>
       </ul>
     </div>
   </div>
 </div>`);
    if (images[vm.id]) {
      vm.$element.find(".image").append(images[vm.id]);
    }
    vm.element = vm.$element[0];
    vm.element.addEventListener("click", () => {
      setUrl("/view/" + vm.id);
    });
    vmContainer.append(vm.$element);
  });

  const $detailsCheckbox = $("#details-checkbox");
  $detailsCheckbox.checkbox({onChange: () =>
    vms.forEach(vm => vm.element.querySelector(".vm-info").style.display = 
          $detailsCheckbox.checkbox("is checked") ? "" : "none"),
    fireOnInit: true
  });

  const getTristateCheckboxValue = $checkbox => $checkbox.checkbox("is determinate") ? $checkbox.checkbox("is checked") : null;
  const onFilterChanged = () => {
    const official = getTristateCheckboxValue($officialCheckbox);
    const control = getTristateCheckboxValue($controlCheckbox);
    const uploads = getTristateCheckboxValue($uploadsCheckbox);
    const safeForWork = getTristateCheckboxValue($sfwCheckbox);
    if (safeForWork) {
      window.location.hash += "safe-for-work";
    } else {
      window.location.hash = window.location.hash.replace("safe-for-work", "");
    }
    const text = $searchBox.val();
    if (official === null && control === null
        && uploads === null && safeForWork === null && !text) {
      // no filters, display all VMs
      vms.forEach(vm => vm.element.style.display = "");
      return;
    }
    vms.forEach(vm => {
      const visible = criteriaChecks.every(match => match(vm,
        {text: text, control: control, uploads: uploads,
         safeForWork: safeForWork, official: official}));
      vm.element.style.display = visible ? "" : "none";
    });
  };
  const makeTriStateCheckbox = ($checkbox, settings) => {
    $checkbox.checkbox(Object.assign({beforeChecked: () => {
        if ($checkbox.checkbox("is determinate")) {
          // Workaround for "indeterminate" not changing state
          $checkbox.checkbox("set indeterminate");
          onFilterChanged();
          return false;
        }
      }
    }, settings));
  };
  $searchBox.on("input", onFilterChanged);
  $filterCheckboxes.forEach($checkbox =>
    makeTriStateCheckbox($checkbox, {
      onChange: onFilterChanged
    }));
}
function copyToClipboard(text) {
    const input = document.createElement("input");
    input.setAttribute("value", text);
    document.body.appendChild(input);
    input.select();
    const result = document.execCommand("copy");
    document.body.removeChild(input)
    return result;
 }
const addUsers = (users, ipAddresses) =>
  $("#online-users-count").text(
    $("#online-users").append(users.map((user, i) => !ipAddresses ? `<div class='item'>${user}</div>` : $(`<div class='item'>${user}</div>`).append($(
    `<div class="ui dropdown">
      <i class="ellipsis horizontal icon"></i>
      <div class="menu">
        <div class="item" data-value="captcha">
          <i class="puzzle piece icon"></i>
          Send Captcha
        </div>
        <div class="item" data-value="kick">
          <i class="exclamation triangle icon"></i>
          Kick
        </div>
        <div class="item" data-value="copy-ip">
          <i class="copy outline icon"></i>
          Copy IP (${ipAddresses[i].string})
        </div>
        <div class="item" data-value="ban-ip">
          <i class="ban icon"></i>
          Ban IP
        </div>
      </div>
    </div>`).dropdown({
			action: "nothing",
      onChange: value => {
        switch (value) {
          case "captcha":
            break;
          case "kick":
            break;
          case "copy-ip":
						copyToClipboard(ipAddresses[i].string);
            break;
          case "ban-ip":
						getSocket().sendBanIpRequest(ipAddresses[i].byteVector);
            break;
        }
      }
    })))).children().length);

const relativeTimeFormatter = Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat() : null;
const setChatTimestampText = element => {
  const secondsNow = Math.floor(new Date().getTime() / 1000);
  const minutesAgo = Math.floor((secondsNow - element.dataset.secondsTimestamp) / 60);
  element.innerText = (() => {
    if (minutesAgo < 1) {
      return "now";
    } else if (relativeTimeFormatter) {
      return relativeTimeFormatter.format(-minutesAgo, "minutes");
    } else {
      return minutes + " minutes ago";
    }
  })();
};
window.setInterval(() => 
  Array.from(document.getElementsByClassName("chat-timestamp"))
    .forEach(setChatTimestampText), 60 * 1000);

function waitingTimer(callback, ms, completion) {
	let interval;
	let dots = '';
	const timerCallback = () => {
			const seconds = Math.floor(ms / 1000);
			if (seconds <= 0) {
				clearInterval(interval);
				callback(null);
			} else {
				if (dots.length < 3)
					dots += '.';
				else
					dots = '';
				callback(seconds, dots);
			}
		};
	timerCallback();
	return interval = setInterval(() => { ms -= 1000; timerCallback(); }, 1000);
}

const getIpAddress = byteVector => {
	const ipByteArray = Array.from({length: byteVector.size()}, (_, i) => byteVector.get(i));
	return {
			byteVector: byteVector,
			string: ipFromByteArray(ipByteArray).toString()
		};
};

const viewServerList = () => {
  const socket = getSocket();
  if (socket.connected) {
    socket.sendVmListRequest();
  } else {
    socket.onConnect = () => {
      socket.sendVmListRequest();
    };
  }
  addMessageHandlers({
    onConnect: newUsername => {
      if (newUsername) {
        username = newUsername;
      }
      guacClient.connect();
      $("#vm-view").show();
      $("#vm-list").hide();
			$("#chat-input, #chat-send-btn").prop("disabled", false);
    },
    onDisconnect: () => {
      $("#chat-user").hide();
    },
    onVmDescription: description =>
      $("#vm-description").text(description),
    onVmTurnInfo: (usersWaitingVector, timeRemaining, isPaused) => {
      const usersWaiting = Array.from({length: usersWaitingVector.size()}, (_, i) => usersWaitingVector.get(i))
      if (usersWaiting[0] === username) {
        // The user has control
        hasTurn = true;
        display.className = "focused";
        if (turnInterval !== null)
          clearInterval(turnInterval);
        // Round the turn time up to the nearest second
        if (isPaused) {
          $("#status").html("Paused");
          return;
        }
        turnInterval = waitingTimer(function(seconds) {
            if (seconds !== null) {
              $("#status").html(`Your turn expires in ~${seconds} second${seconds === 1 ? "" : "s"}`);
            } else {
              turnInterval = null;
              $("#status").html("");
            }
          }, Math.round(timeRemaining/1000)*1000);
      } else if (usersWaiting.includes(username)) {
        // The user is waiting for control
        hasTurn = false;
        display.className = "waiting";
        if (turnInterval !== null)
          clearInterval(turnInterval);
        if (isPaused) {
          $("#status").html("Paused");
          return;
        }
        turnInterval = waitingTimer(function(seconds, dots) {
            if (seconds !== null) {
              $("#status").html(`Waiting for turn in ~${seconds} second${seconds === 1 ? "" : "s"}` + dots);
            } else {
              turnInterval = null;
              $("#status").html("");
            }
          }, Math.round(parseInt(parameters[parameters.length-1])/1000)*1000);
      } else {
        if (hasTurn) {
          hasTurn = false;
          display.className = "";
        }
        if (turnInterval !== null) {
          clearInterval(turnInterval);
          turnInterval = null;
          $("#status").html("");
        }
      }
    },
    onChatMessage: (channelId, username, message, timestamp) => {
      const chatPanel = $("#chat-panel").get(0);
      const atBottom = chatPanel.offsetHeight + chatPanel.scrollTop >= chatPanel.scrollHeight;
      var chatElement = $('<li><div></div></li>');
      if (username) {
        chatElement.children().first().html(message).prepend($('<span class="username"></span>').text(username), '<span class="spacer">\u25B8</span>');
      } else {
        chatElement.children().first().addClass("server-message").html(message);
      }

      const timestampElement = $('<span class="chat-timestamp"></span>');
      timestampElement[0].dataset.secondsTimestamp = timestamp;
      setChatTimestampText(timestampElement[0]);
      chatElement.children().first().append(timestampElement);

      var chatBox = $("#chat-box");
      var children = chatBox.children();
      const maxChatMsgHistory = 100;
      if (children.length >= maxChatMsgHistory)
        children.first().remove();
      chatBox.append(chatElement);
      if (atBottom) {
        chatPanel.scrollTop = chatPanel.scrollHeight;
      }
    },
    onUserList: (channelId, usernamesVector) => {
      const usernames = Array.from({length: usernamesVector.size()}, (_, i) => usernamesVector.get(i))
      addUsers(usernames);
    },
    onUserListAdd: (channelId, username) => {
      addUsers([username]);
    },
    onUserListRemove: (channelId, username) => {
      $("#online-users > *").filter((i, user) => user.innerText === username).remove();
    },
    onAdminUserList: (channelId, usernamesVector, ipAddressesVector) => {
      const usernames = Array.from({length: usernamesVector.size()}, (_, i) => usernamesVector.get(i));
      const ipAddresses = Array.from({length: ipAddressesVector.size()}, (_, i) => getIpAddress(ipAddressesVector.get(i)));
      addUsers(usernames, ipAddresses);
    },
    onAdminUserListAdd: (channelId, username, ipAddress) => {
      addUsers([username], [getIpAddress(ipAddress)]);
    },
    onVmInfo: vmInfo => {
      displayVmList(
        Array.from({length: vmInfo.size()}, (_, i) => vmInfo.get(i)));
      $("#loading").hide();
    },
    onVmThumbnail: (vmId, thumbnail) => {
      const imageBlob = new Blob([thumbnail], {type: "image/png"});
      const imageUrl = URL.createObjectURL(imageBlob);
      const image = new Image();
      image.src = imageUrl;
      image.onload = image.onerror = () => URL.revokeObjectURL(imageUrl);
      $(`#vm-container > [data-id='${vmId}'] .image`).empty().append(image);
    },
    onServerConfig: config => {
      showServerConfig(config);
    },
    onRegisterAccountSucceeded: (sessionId, username) => {
      saveSessionInfo(sessionId, username);
    },
    onRegisterAccountFailed: error => {
      console.error(error);
    },
    onLoginSucceeded: (sessionId, username) => {
      $("#login-modal").modal("hide");
      $("#login-btn").removeClass("loading");
      saveSessionInfo(sessionId, username);
      $("#chat-user").text(username).show();
    },
    onLoginFailed: error => {
      $("#login-btn").removeClass("loading");
      $("#login-status").text(error);
    },
    onGuacInstr: (name, instr) =>
      collabVmTunnel.oninstruction(name, instr)
  });

  $($filterCheckboxes.map($checkbox =>
    $checkbox[0])).checkbox(
      "set indeterminate", );

  $('.ui.dropdown').dropdown({action:"nothing"});
};
