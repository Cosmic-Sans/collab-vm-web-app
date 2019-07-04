import {registerUrlRouter, setUrl, getSocket, addMessageHandlers, createObject} from "common";
import Tabulator from "tabulator-tables";
import "tabulator_semantic-ui.css";

registerUrlRouter(path => {
  if (path === "/admin") {
      initAdminPanel();
  }
});

Array.prototype.toVector = function(name) {
  const vector = createObject(name);
  this.forEach(element => vector.push_back(element));
  return vector;
}

function initAdminPanel() {
  function showVmConfig(vmConfig) {
    function initCheckbox($checkbox, checked, onChange) {
      const setValueString = "set " + (checked ? "checked" : "unchecked");
      $checkbox.parent()
        .checkbox() // Remove any previous handlers
        .checkbox(setValueString) // Set current value
        .checkbox({ // Add a new handler
          onChange: onChange
        });
    }
    initCheckbox($("#vm-settings :checkbox[name='autostart']"),
      vmConfig.getAutoStart(), function() {
          const vmSettings = createObject("VmSettings");
          vmSettings.setAutoStart(this.checked);
          socket.sendVmSettings(currentVmId, vmSettings);
        });

    $("#vm-settings :text[name='name']").val(vmConfig.getName()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setName(this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    $("#vm-settings :input[name='description']").val(vmConfig.getDescription()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setDescription(this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    initCheckbox($("#vm-settings :checkbox[name='safe-for-work']"),
      vmConfig.getSafeForWork(), function() {
          const vmSettings = createObject("VmSettings");
          vmSettings.setSafeForWork(this.checked);
          socket.sendVmSettings(currentVmId, vmSettings);
        });

    $("#vm-settings :text[name='operating-system']").val(vmConfig.getOperatingSystem()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setOperatingSystem(this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    $("#vm-settings :input[name='ram']").val(vmConfig.getRam()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setRam(+this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    $("#vm-settings :input[name='disk-space']").val(vmConfig.getDiskSpace()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setDiskSpace(+this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    $("#vm-settings :text[name='start-command']").val(vmConfig.getStartCommand()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setStartCommand(this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    $("#vm-settings :text[name='stop-command']").val(vmConfig.getStopCommand()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setStopCommand(this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    initCheckbox($("#vm-settings :checkbox[name='turns-enabled']"),
      vmConfig.getTurnsEnabled(), function() {
          const vmSettings = createObject("VmSettings");
          vmSettings.setTurnsEnabled(this.checked);
          socket.sendVmSettings(currentVmId, vmSettings);
        });

    $("#vm-settings :input[name='turn-time']").val(vmConfig.getTurnTime()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setTurnTime(+this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    initCheckbox($("#vm-settings :checkbox[name='uploads-enabled']"),
      vmConfig.getUploadsEnabled(), function() {
          const vmSettings = createObject("VmSettings");
          vmSettings.setUploadsEnabled(this.checked);
          socket.sendVmSettings(currentVmId, vmSettings);
        });

    $("#vm-settings :input[name='upload-cooldown-time']").val(vmConfig.getUploadCooldownTime()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setUploadCooldownTime(+this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    // TODO: set select to appropriate unit
    $("#vm-settings :input[name='max-upload-size']").val(vmConfig.getMaxUploadSize()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        const unitValue = this.nextElementSibling.value;
        vmSettings.setMaxUploadSize(this.value * Math.pow(2, 10 * unitValue));
        socket.sendVmSettings(currentVmId, vmSettings);
      }).next().off("change").change(() => $(this).prev().trigger("change"));

    $("#vm-settings :input[name='protocol']").val(vmConfig.getProtocol()).off("change")
      .change(function() {
        const vmSettings = createObject("VmSettings");
        vmSettings.setProtocol(+this.value);
        socket.sendVmSettings(currentVmId, vmSettings);
      });

    function sendGuacamoleParameters() {
      const guacParams = 
        guacTable.getData().filter(row => row["name"])
          .map(row => ({name: row.name, value: row.value || ""}))
          .toVector("GuacamoleParameters");
      const vmSettings = createObject("VmSettings");
      vmSettings.setGuacamoleParameters(guacParams);
      socket.sendVmSettings(currentVmId, vmSettings);
    }
    const guacTable = new Tabulator("#guac-table", {
      layout: "fitColumns",
      placeholder: $("#guac-table-placeholder")[0],
      movableRows: true,
      columns:[
        {title: "Name", field: "name", editor: "input"},
        {title: "Value", field: "value", editor: "input"},
        {formatter: "buttonCross", width:"5%", align:"center", headerSort: false,
          cellClick: (e, cell) => cell.getRow().delete()
        }
      ],
      data: Array.from(
        {length: vmConfig.getGuacamoleParameters().size()},
        (_, i) => vmConfig.getGuacamoleParameters().get(i)),
      footerElement: $("#guac-table-footer").children().click(async () =>
        {
          const row = await guacTable.addRow({});
          row.getCell("name").edit();
        }).end()[0],
      dataEdited: sendGuacamoleParameters,
      rowAdded: row => {
      },
      rowUpdated: row => {
      },
      rowDeleted: row => {
      },
      rowMoved: row => {
      }
    });

    $("#delete-vm-button").off("click").click(() => {
      $("#delete-vm-modal").modal({
        onApprove: () => {
          $("#vm-settings").hide("slow");
          socket.sendDeleteVm(currentVmId);
        },
      }).modal("show");
    });

    $("#vm-settings").show("slow");

    // The table must be redrawn after its parent becomes visible
    guacTable.redraw();
  }

  let currentVmId;
addMessageHandlers({
  onVmCreated: vmId => {
    currentVmId = vmId;
    showVmConfig(createObject("VmSettings"));
  },
  onAdminVms: vmVector => {
    const vms = Array.from(
      {length: vmVector.size()}, (_, i) => vmVector.get(i));
    const vmsList = new Tabulator("#vm-list", {
      layout: "fitColumns",
      placeholder: "No VMs",
      columns: [{title: "Name", field: "name"},
                {title: "Status", field: "status"}],
      data: vms,
      selectable: true,
      rowSelectionChanged: (data, rows) => {
        $("#settings-vm-button")
          .prop("disabled", data.length !== 1)
          .off("click").click(() => {
            currentVmId = data[0].id;
            socket.sendReadVmConfig(currentVmId);
          });
        $("#start-vm-button, #stop-vm-button, #restart-vm-button")
          .prop("disabled", !data.length);
        const vmIds = data.map(vm => vm.id).toVector("UInt32Vector");
        $("#start-vm-button").off("click").click(() => {
          socket.sendStartVmsRequest(vmIds);
        });
        $("#stop-vm-button").off("click").click(() => {
          socket.sendStopVmsRequest(vmIds);
        });
        $("#restart-vm-button").off("click").click(() => {
          socket.sendRestartVmsRequest(vmIds);
        });
      }
    });
  },
  onVmConfig: vmConfig => {
    showVmConfig(vmConfig);
  },
  onVmInfo: vmInfo => {
    displayVmList(
      Array.from({length: vmInfo.size()}, (x, i) => vmInfo.get(i)));
    $("#loading").hide();
  },
  onServerConfig: config => {
    showServerConfig(config);
  },
  onRegisterAccountSucceeded: (sessionId, username) => {
    $("#login-button").removeClass("loading");
    saveSessionInfo(sessionId, username);
  },
  onRegisterAccountFailed: error => {
    $("#login-button").removeClass("loading");
    console.error(error);
  },
  onLoginSucceeded: (sessionId, username) => {
    $("#login-button").removeClass("loading");
    saveSessionInfo(sessionId, username);
  },
  onLoginFailed: (error) => {
    $("#login-button").removeClass("loading");
    console.error(error);
  },
  onGuacInstr: (name, instr) => {
    collabVmTunnel.oninstruction(name, instr);
  },
  onChatMessage: (channelId, message) => {
    debugger;
  }
});

function onSocketConnected() {
  socket.sendServerConfigRequest();
  socket.sendReadVmsRequest();
}
const socket = getSocket();
window.socket = socket;
socket.onConnect = onSocketConnected;
if (socket.connected) {
  socket.onConnect();
}

let twoFactorToken;

$("#login-button").click(function() {
  socket.sendLoginRequest($("#username-box").val(), $("#password-box").val());
  $(this).addClass("loading");
});

$("#register-button").click(function() {
  socket.sendAccountRegistrationRequest($("#username-box").val(),
    $("#password-box").val(), twoFactorToken || "");
  $(this).addClass("loading");
});

$("#validate-2fa-box").keypress(function(event) {
  if (event.which === 13) {
    $("#activate-2fa-modal .ui.ok.button").click();
    return true;
  }
  return this.value.length < 6 && event.which >= 48 && event.which <= 57;
}).on("input",
function() { $("#activate-2fa-modal .ui.ok.button").toggleClass("disabled", !this.value); })
.trigger("input");
$("#enable-2fa-toggle").checkbox({
  onChecked: () => {
    var totp;

    function generateKey() {
      totp = new OTPAuth.TOTP({
        issuer: "CollabVM",
//                            label: $("#username-box").val(),
      algorithm: "SHA1",
      digits: 6,
      period: 30
      });
      $("#qrcode").empty().qrcode(totp.toString());
    }

    if ($.fn.qrcode) {
      generateKey();
    } else {
      var script = document.createElement("script");
      script.type = "text/javascript";
      script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jquery.qrcode/1.0/jquery.qrcode.min.js";
      script.integrity =
      "sha384-0B/45e2to395pfnCkbfqwKFFwAa7zXdvd42eAFJa3Vm8KZ/jmHdn93XdWi//7MDS";
      script.crossOrigin = "anonymous";
      script.onload = generateKey;
      document.body.appendChild(script);
    }

    $("#activate-2fa-modal").modal({
      closable: false,
      onDeny: () => $("#enable-2fa-toggle").checkbox("set unchecked"),
      onApprove: function() {
        if (totp.validate({ token: $("#validate-2fa-box").val() }) === null) {
          alert("Wrong passcode");
          return false;
        }
        twoFactorToken = totp.secret.buffer;
      }
    }).modal("show");
  },
  onUnchecked: () => key = null
});

$("#account-registration-checkbox").change(function() {
  var config = window.serverConfig;
  config.setAllowAccountRegistration(this.checked);
  socket.sendServerConfigModifications(config);
});

$("#recaptcha-enabled-checkbox").change(function() {
  var config = window.serverConfig;
  config.setRecaptchaEnabled(this.checked);
  socket.sendServerConfigModifications(config);
});

$("#user-vms-enabled-checkbox").change(function() {
  var config = window.serverConfig;
  config.setUserVmsEnabled(this.checked);
  socket.sendServerConfigModifications(config);
});

$("#recaptcha-twoFactorToken-box").change(function() {
  var config = window.serverConfig;
  config.setRecaptchaKey(this.value);
  socket.sendServerConfigModifications(config);
});

$("#recaptcha-key-box").change(function() {
  const config = window.serverConfig;
  config.setRecaptchaKey(this.value);
  socket.sendServerConfigModifications(config);
});

$("#ban-ip-cmd-box").change(function() {
  const config = window.serverConfig;
  config.setBanIpCommand(this.value);
  socket.sendServerConfigModifications(config);
});

$("#unban-ip-cmd-box").change(function() {
  const config = window.serverConfig;
  config.setUnbanIpCommand(this.value);
  socket.sendServerConfigModifications(config);
});

$("#new-vm-button").click(() => socket.sendCreateVmRequest(createObject("VmSettings")));

function showLoginForm() {
  $("#loading").hide();
  $("#edit-account").hide();
  $("#view-vms").hide();
  $("#linked-servers").hide();
  $("#server-config").hide();
  $("#login-register-container").show();
  $("#register-form").hide();
  $("#linked-servers").hide();
  $("#login-form").show();
}

function showRegisterForm() {
  $("#loading").hide();
  $("#edit-account").hide();
  $("#view-vms").hide();
  $("#linked-servers").hide();
  $("#server-config").hide();
  $("#login-register-container").show();
  $("#register-form").show();
  $("#linked-servers").hide();
  $("#login-form").hide();
}

function showEditAccount() {
  $("#loading").hide();
  $("#login-register-container").hide();
  $("#edit-account").show();
  $("#view-vms").hide();
  $("#linked-servers").hide();
  $("#server-config").hide();
}

function showVms() {
  $("#loading").hide();
  $("#login-register-container").hide();
  $("#edit-account").hide();
  $("#view-vms").show();
  $("#linked-servers").hide();
  $("#server-config").hide();
  $("#vm-settings .ui.form .close.button").click(() => $("#vm-settings").hide("slow"));
  $("#vm-settings [name='name']").off("change").change(function() {
    const config = window.serverConfig;
    config.setBanIpCommand(this.value);
    socket.sendServerConfigModifications(config);
  });
}

function showLinkedServers() {
  $("#loading").hide();
  $("#login-register-container").hide();
  $("#edit-account").hide();
  $("#view-vms").hide();
  $("#linked-servers").show();
  $("#server-config").hide();
}

function showLoading() {
  $("#loading").show();
  $("#login-register-container").hide();
  $("#edit-account").hide();
  $("#view-vms").hide();
  $("#linked-servers").hide();
  $("#server-config").hide();
}

function showServerConfig(config) {
  $("#loading").hide();
  $("#login-register-container").hide();
  $("#edit-account").hide();
  $("#view-vms").show();
  $("#linked-servers").hide();
  //$("#server-config").show();

  window.serverConfig = config.clone();
  $("#account-registration-checkbox").prop("checked", config.getAllowAccountRegistration());
  $("#recaptcha-enabled-checkbox").prop("checked", config.getRecaptchaEnabled());
  $("#recaptcha-key-box").val(config.getRecaptchaKey());
  $("#user-vms-enabled-checkbox").prop("checked", config.getUserVmsEnabled());
  $("#ban-ip-cmd-box").val(config.getBanIpCommand());
  $("#unban-ip-cmd-box").val(config.getUnbanIpCommand());
}
//showServerConfig();
function loadServerConfig() {
  showLoading();
  socket.getServerConfigRequest();
}
//loadServerConfig();
//showRegisterForm();
//showServerConfig();
showVms();
$(".ui.checkbox").checkbox();
}
