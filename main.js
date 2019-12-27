import {registerUrlRouter, setUrl, getPath, getSocket, addMessageHandlers, saveSessionInfo, loadSessionInfo, common} from "common";
import $ from "jquery";
import Guacamole from "Guacamole";
import "chat.css";
import {fromByteArray as ipFromByteArray} from "ipaddr.js";

let currentVmId = null;
let hasTurn = false;
let username = null;
let turnInterval = null;
let voteInterval = null;
let captchaRequired = false;
let hasVoted = false;
let isAdmin = false;
let isLoggedIn = false;

registerUrlRouter(path => {
  const socket = getSocket();
  socket.onSocketDisconnect = () => {
    $("#chat-user").text(username = "");
    isAdmin = false;
    currentVmId = null;
    showLoading();
  };
  addMessageHandlers({
    onVmInfo: () => {}
  });
  if (path === "") {
    addMessageHandlers({
      onVmInfo: vmInfo => {
        displayVmList(
          Array.from({length: vmInfo.size()}, (_, i) => vmInfo.get(i)));
      }
    });
    viewServerList();
  } else if (path.startsWith("/vm/")) {
    const vmId = +path.substr("/vm/".length);
    socket.onSocketConnect = () => {
      if (currentVmId === vmId) {
        viewVm();
        return;
      }
      currentVmId = vmId;
      getSocket().sendConnectRequest(vmId);
    };
  } else if (path === "/login") {
    socket.onSocketConnect = showLoginForm;
  } else if (path === "/register") {
    socket.onSocketConnect = showRegisterForm;
  } else if (path.startsWith("/invite/")) {
    socket.onSocketConnect = () => {
      getSocket().validateInvite(getInviteId());
    };
  } else {
    hideEverything();
    return false;
  }
  if (socket.onSocketConnect && socket.connected) {
    socket.onSocketConnect();
  }
});

function showLoading() {
  hideEverything();
  $("#loading").show();
}

function showLoginForm() {
  hideEverything();
  $("#login-register-container, #login-form").show();

  if (RECAPTCHA_ENABLED) {
    $("#login-button").hide();
    grecaptcha.render(
      $("<div>").appendTo($("#captcha").empty())[0],
      {
        sitekey: RECAPTCHA_SITE_KEY,
        callback: token => {
          $("#login-register-status").text("").removeClass("visible");
          getSocket().sendLoginRequest($("#username-box").val(), $("#password-box").val(), token);
          showLoading();
        }
      });
  } else {
    $("#login-button").off("click").click(function() {
      $("#login-register-status").text("").removeClass("visible");
      getSocket().sendLoginRequest($("#username-box").val(), $("#password-box").val());
      $(this).addClass("loading");
    });
  }
}

const getInviteId = () => {
  const path = getPath();
  const inviteId =
    path.startsWith("/invite/")
    ? atob(path.substring("/invite/".length))
    : "";
  return Array.from({length: inviteId.length}, (_, i) => inviteId.charCodeAt(i)).toVector("UInt8Vector");
};

function showRegisterForm() {
  hideEverything();
  $("#login-register-container, #register-form").show();
  const twoFactorToken = "";

  const hasInvite = $("#username-box").prop("disabled");
  if (!hasInvite && RECAPTCHA_ENABLED) {
    $("#register-button").hide();
    grecaptcha.render(
      $("<div>").appendTo($("#captcha").empty())[0],
      {
        sitekey: RECAPTCHA_SITE_KEY,
        callback: token => {
          const usernameBox = $("#username-box");
          $("#login-register-status").text("").removeClass("visible");
          getSocket().sendAccountRegistrationRequest(usernameBox.prop("disabled") ? "" : usernameBox.val(),
            $("#password-box").val(), twoFactorToken || "", getInviteId(), token);
          showLoading();
        }
      });
  } else {
    $("#register-button").off("click").click(function() {
      const usernameBox = $("#username-box");
      $("#login-register-status").text("").removeClass("visible");
      getSocket().sendAccountRegistrationRequest(usernameBox.prop("disabled") ? "" : usernameBox.val(),
        $("#password-box").val(), twoFactorToken || "", getInviteId(), "");
      $(this).addClass("loading");
    });
  }
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

$("#mute-button").click(function() {
  const audioContext = Guacamole.AudioContextFactory.getAudioContext();
  const audioGain = Guacamole.AudioContextFactory.gain;
  const $icon = $(this).children("i");
  if ($icon.hasClass("mute")) {
    audioGain.gain.setValueAtTime(1, audioContext.currentTime);
    $icon.addClass("up").removeClass("mute")[0].nextSibling.nodeValue = "Mute";
  } else {
    audioGain.gain.setValueAtTime(0, audioContext.currentTime);
    $icon.addClass("mute").removeClass("up")[0].nextSibling.nodeValue = "Unmute";
  }
});

CollabVmTunnel.prototype = new Guacamole.Tunnel();
const collabVmTunnel = new CollabVmTunnel();
const guacClient = new Guacamole.Client(collabVmTunnel);
const display = document.getElementById("display");
guacClient.getDisplay().getElement().addEventListener("mousedown", () => document.activeElement.blur());
guacClient.getDisplay().getElement().addEventListener("click", () => {
  if (captchaRequired) {
    showCaptchaModal(() => getSocket().sendTurnRequest());
    return;
  }
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

$("#chat-input").keypress(function(e) {
  const enterKeyCode = 13;
  if (e.which === enterKeyCode) {
    e.preventDefault();
    $("#chat-send-btn").trigger("click");
  } else if (this.value.length >= common.getMaxChatMessageLength()) {
    e.preventDefault();
  }
}).on("input", function() {
  // Truncate chat messages that are too long
  const maxChatMsgLen = common.getMaxChatMessageLength();
  if (this.value.length > maxChatMsgLen) {
    this.value = this.value.substr(0, maxChatMsgLen);
  }
});

let lastChatMessageTime = 0;
$("#chat-send-btn").click(function() {
  const $this = $(this);
  if ($this.prop("disabled")) {
    return;
  }
  if (captchaRequired) {
    showCaptchaModal(() => $("#chat-send-btn").click());
    return;
  }
  const now = Date.now();
  const waitTime = now - lastChatMessageTime;
  const chatRateLimit = common.getChatRateLimit();
  if (waitTime < chatRateLimit) {
    $this.prop("disabled", true).addClass("loading");
    setTimeout(() => {
      $this.prop("disabled", false).removeClass("loading").trigger("click");
    }, chatRateLimit - waitTime);
    return;
  }
  var chat = $("#chat-input");
  var msg = chat.val().trim();
  if (msg.length > 0 && msg.length <= common.getMaxChatMessageLength()) {
    lastChatMessageTime = now;
    getSocket().sendChatMessage(currentVmId, msg);
    chat.val("");
  }
});
$("#end-turn-btn").click(() => getSocket().endTurn());
$("#pause-turns-btn").click(() => getSocket().pauseTurnTimer());
$("#resume-turns-btn").click(() => getSocket().resumeTurnTimer());
$("#login-item").show();

const updateSession = (sessionId, newUsername) => {
  username = newUsername;
  $("#chat-user").text(username);
  saveSessionInfo(sessionId, username);
  isLoggedIn = !!sessionId;
};

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
           <div class="item"><i class="fab fa-windows" aria-hidden="true"></i> ${vm.operatingSystem}</li>
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
      setUrl("/vm/" + vm.id);
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
  hideEverything();
  $("#vm-list").show();
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
      action: "hide",
      onChange: value => {
        switch (value) {
          case "captcha":
            getSocket().sendCaptcha(user, currentVmId);
            break;
          case "kick":
            getSocket().kickUser(user, currentVmId);
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

const hideEverything = () => {
  $("#loading, #not-found, #vm-view, #vm-list, #login-register-container, #register-form, #login-form, #vote-alert, #vote-status, #start-vote-button, #admin-controls").hide();
  $("#captcha-modal").modal("hide");
};
const viewServerList = () => {
  showLoading();
  const socket = getSocket();
  socket.onSocketConnect = () => {
    socket.sendVmListRequest();
  };
  $($filterCheckboxes.map($checkbox =>
    $checkbox[0])).checkbox(
      "set indeterminate", );

  $('.ui.dropdown').dropdown({action:"nothing"});
};

function viewVm() {
  hideEverything();
  $("#vm-view").show();
  $("#change-username-button").toggle(!isLoggedIn).click(() => {
    $("#change-username-modal").modal({
      onApprove: () => {
        getSocket().changeUsername($("#new-username-input").val());
      }
    }).modal("show");
  });
  $("#admin-controls").toggle(isAdmin);
  $("#chat-input").prop("disabled", captchaRequired);
  $("#chat-send-btn").prop("disabled", false);

	$("#start-vote-button").off("click").click(function() {
    if (captchaRequired) {
      showCaptchaModal(() => $("#start-vote-button").click());
      return;
    }
		if (hasVoted) {
      return;
    }
		hasVoted = true;
		getSocket().sendVote(true);
	});
	
	$("#vote-yes-button").off("click").click(function() {
    if (captchaRequired) {
      showCaptchaModal(() => $("#vote-yes-button").click());
      return;
    }
		if (hasVoted) {
      return;
    }
    hasVoted = true;
    getSocket().sendVote(true);
    $("#vote-alert").hide();
	});
	
	$("#vote-no-button").off("click").click(function() {
    if (captchaRequired) {
      showCaptchaModal(() => $("#vote-no-button").click());
      return;
    }
		if (hasVoted) {
      return;
    }
    hasVoted = true;
    getSocket().sendVote(false);
    $("#vote-alert").hide();
	});
	
	$("#vote-dismiss-button").off("click").click(function() {
		$("#vote-alert").hide();
	});
}

function showCaptchaModal(callback) {
  const modal = $("#captcha-modal");
  grecaptcha.render(
    $("<div>").appendTo(modal.find(".content").empty())[0],
    {
      sitekey: RECAPTCHA_SITE_KEY,
      callback: token => {
        modal.modal("hide");
        getSocket().sendCaptchaCompleted(token);
        captchaRequired = false;
        $("#chat-input").prop("disabled", captchaRequired);
        if (callback) {
          callback();
        }
      }
    });
  modal.modal("show");
}

const goBackOrHome = () => {
  if (window.history.state) {
    window.history.back();
  } else {
    setUrl("/");
  }
};

function hideVotes() {
  if (voteInterval) {
    clearInterval(voteInterval);
    voteInterval = null;
  }
  $("#vote-status, #vote-alert").hide();
}

addMessageHandlers({
  onConnect: (newUsername, captchaRequired2) => {
    if (newUsername) {
      updateSession("", newUsername);
    }
    captchaRequired = captchaRequired2;
    lastChatMessageTime = 0;
    $("#chat-input").prop("disabled", captchaRequired);
    guacClient.connect();
    $("#chat-box").empty();
    viewVm();
  },
  onCaptchaRequired: captchaRequired2 => {
    captchaRequired = captchaRequired2;
    $("#chat-input").prop("disabled", captchaRequired);
    if (hasTurn) {
      showCaptchaModal();
    }
  },
  onVotesDisabled: () => {
    hideVotes();
    $("#start-vote-button").hide();
  },
  onVoteStatus: (timeRemaining, yesVoteCount, noVoteCount) => {
    hideVotes();
    $("#start-vote-button").show().prop("disabled", timeRemaining);
    if (!timeRemaining) {
      return;
    }
    $("#vote-label-yes").html(yesVoteCount);
    $("#vote-label-no").html(noVoteCount);
    if (voteInterval) {
      clearInterval(voteInterval);
      voteInterval = null;
    }
    var ms = timeRemaining;
    const voteStatus = () => {
      ms -= 1000;
      var seconds = Math.floor(ms / 1000);
      if (seconds <= 0) {
        clearInterval(voteInterval);
      } else {
        $("#vote-time").html(seconds);
      }
    };
    voteStatus();
    $("#vote-status").show();

    voteInterval = setInterval(voteStatus, 1000);

    if (!hasVoted) {
      $("#vote-alert").show();
    }
  },
  onVoteResult: votePassed => {
    hasVoted = false;
    hideVotes();
    $("#start-vote-button").show()
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
        }, Math.round(timeRemaining/1000)*1000);
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
      chatElement.children().first().text(message).prepend($('<span class="username"></span>').text(username), '<span class="spacer">\u25B8</span>');
    } else {
      chatElement.children().first().addClass("server-message").text(message);
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
    $("#online-users > *").empty();
    const usernames = Array.from({length: usernamesVector.size()}, (_, i) => usernamesVector.get(i))
    addUsers(usernames);
  },
  onUserListAdd: (channelId, username) => {
    addUsers([username]);
  },
  onUserListRemove: (channelId, username) => {
    const userList = $("#online-users");
    userList.children().filter((i, user) => user.innerText === username).remove();
    $("#online-users-count").text(userList.children().length);
  },
  onAdminUserList: (channelId, usernamesVector, ipAddressesVector) => {
    $("#online-users > *").empty();
    const usernames = Array.from({length: usernamesVector.size()}, (_, i) => usernamesVector.get(i));
    const ipAddresses = Array.from({length: ipAddressesVector.size()}, (_, i) => getIpAddress(ipAddressesVector.get(i)));
    addUsers(usernames, ipAddresses);
  },
  onAdminUserListAdd: (channelId, username, ipAddress) => {
    addUsers([username], [getIpAddress(ipAddress)]);
  },
  onUsernameTaken: () => {
    alert("That username is taken");
  },
  onUsernameChange: (oldUsername, newUsername) => {
    $("#online-users").children().filter((i, user) => user.innerText === oldUsername)[0].innerText = newUsername;
    if (username === oldUsername) {
      updateSession("", newUsername);
      const $changeUsernameButton = $("#change-username-button").prop("disabled", true);
      setTimeout(() => {
        $changeUsernameButton.prop("disabled", false);
      }, common.getUsernameChangeRateLimit());
    }
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
    updateSession(sessionId, username);
    goBackOrHome();
  },
  onRegisterAccountFailed: error => {
    showRegisterForm();
    $("#login-btn").removeClass("loading");
    $("#login-register-status").text(error).addClass("visible");
  },
  onLoginSucceeded: (sessionId, username, isAdmin2) => {
    $("#login-btn").removeClass("loading");
    updateSession(sessionId, username);
    goBackOrHome();
    isAdmin = isAdmin2;
  },
  onLoginFailed: error => {
    showLoginForm();
    $("#login-btn").removeClass("loading");
    $("#login-register-status").text(error).addClass("visible");
  },
  onGuacInstr: (name, instr) =>
    collabVmTunnel.oninstruction(name, instr),
  onInviteValidationResponse: (isValid, username) => {
    if (isValid) {
      showRegisterForm();
      $("#username-box").val(username).prop("disabled", true);
    } else {
      console.error("Invalid invite");
    }
  }
});
