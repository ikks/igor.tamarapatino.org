window.player = null;
const basic_seqs = {
  "\\r": "Ret",
  "\\t": "Tab",
  "\\u001b": "Esc",
  "^?": "Back",
  "\\u000b": "Beep",
  "\\u0001": "C-a",
  "\\u0002": "C-b",
  "\\u0003": "C-c",
  "\\u0004": "C-d",
  "\\u0005": "C-e",
  "\\u0006": "C-f",
  "\\u0007": "C-g",
  "\\u0008": "C-h",
  "\\u0009": "C-i",
  "\\u0010": "C-j",
  "\\u0011": "C-k",
  "\\u0012": "C-l",
  "\\u0013": "C-m",
  "\\u0014": "C-n",
  "\\u0015": "C-o",
  "\\u0016": "C-p",
  "\\u0017": "C-q",
  "\\u0018": "C-r",
  "\\u0019": "C-s",
  "\\u0020": "C-t",
  "\\u0021": "C-u",
  "\\u0022": "C-v",
  "\\u0023": "C-w",
  "\\u0024": "C-x",
  "\\u0025": "C-y",
  "\\u0026": "C-z",
};

const singles = {
  " ": "Spc",
};

const unicode_seq = {
  "[3~": "Supr",
  "[C": "Right",
  OC: "Right",
  "[1;3C": "A-Right",
  "[D": "Left",
  OD: "Left",
  "[1;3D": "A-Left",
  "[A": "Up",
  OA: "Up",
  "[1;3A": "A-Up",
  "[B": "Down",
  OB: "Down",
  "[1;3B": "A-Down",
  "[H": "Home",
  "[5~": "PgUp",
  "[57421u": "PgUp",
  "[57421;1:3u": "PgUp",
  "[57362u": "PgUp",
  "[57362;1:3u": "PgUp",
  "[6~": "PgDn",
  "[57422u": "PgDn",
  "[57422;1:3u": "PgDn",
  OP: "F1",
  "[P": "F1",
  "[1;1:3P": "F1",
  OQ: "F2",
  "[Q": "F2",
  "[1;1:3Q": "F2",
  OR: "F3",
  "[R": "F3",
  "[1;1:3R": "F3",
  OS: "F4",
  "[S": "F4",
  "[1;1:3S": "F4",
  "[15~": "F5",
  "[15;1:3~": "F5",
  "[17~": "F6",
  "[17;1:3~": "F6",
  "[18~": "F7",
  "[18;1:3~": "F7",
  "[19~": "F8",
  "[19;1:3~": "F8",
  "[20~": "F9",
  "[20;1:3~": "F9",
  "[21~": "F10",
  "[21;1:3~": "F10",
  "[23~": "F11",
  "[23;1:3~": "F11",
  "[24~": "F12",
  "[24;1:3~": "F12",
  a: "A-a",
  b: "A-b",
  c: "A-c",
  d: "A-d",
  e: "A-e",
  f: "A-f",
  g: "A-g",
  h: "A-h",
  i: "A-i",
  j: "A-j",
  k: "A-k",
  l: "A-l",
  m: "A-m",
  n: "A-n",
  o: "A-o",
  p: "A-p",
  q: "A-q",
  r: "A-r",
  s: "A-s",
  t: "A-t",
  u: "A-u",
  v: "A-v",
  w: "A-w",
  x: "A-x",
  y: "A-y",
  z: "A-z",
  "[27u": "Esc",
  "[97;3u": "A-a",
  "[97;;97u": "A-a",
  "[98;;98u": "A-b",
  "[99;;99u": "A-c",
  "[100;;100u": "A-d",
  "[101;3u": "A-e",
  "[102;;102u": "A-f",
  "[103;;103u": "A-g",
  "[104;;104u": "A-h",
  "[105;;105u": "A-i",
  "[106;;106u": "A-j",
  "[107;;107u": "A-k",
  "[108;;108u": "A-l",
  "[109;;109u": "A-m",
  "[110;;110u": "A-n",
  "[111;;111u": "A-o",
  "[112;;112u": "A-p",
  "[113;;113u": "A-q",
  "[114;;114u": "A-r",
  "[115;;115u": "A-s",
  "[116;;116u": "A-t",
  "[117;;117u": "A-u",
  "[118;;118u": "A-v",
  "[119;;119u": "A-w",
  "[120;;120u": "A-x",
  "[121;;121u": "A-y",
  "[122;;122u": "A-z",
};

function formatKeyCode(data, logger) {
  let rep = JSON.stringify(data).slice(1, -1);
  if (rep.length === 1) {
    if (rep in singles) {
      return singles[rep];
    }
    return rep;
  }

  if (rep in basic_seqs) {
    return basic_seqs[rep];
  }
  if (rep.length < 6) {
    logger.info("Short <" + rep + ">", rep.length);
    return "";
  }
  rep = rep.slice(6);
  if (rep in unicode_seq) return unicode_seq[rep];
  logger.info(rep, unicode_seq[rep]);

  if (rep.slice.length < 10) logger.info("<" + rep + ">", rep.length);
  return "";
}

function findGetParameter(parameterName) {
  var result = null,
      tmp = [];
  location.search
      .substr(1)
      .split("&")
      .forEach(function (item) {
        tmp = item.split("=");
        if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
      });
  return result;
}

function playthis(video) {
  if (window.player != null) window.player.pause();
  delete window.player;
  if (document.getElementsByClassName("ap-wrapper").length > 0)
    document.getElementsByClassName("ap-wrapper")[0].remove();
  window.player = AsciinemaPlayer.create(
    video,
    document.getElementById("demo"),
    {
      theme: "dracula",
      autoPlay: true,
      loop: true,
      // idle: 1,
      logger: console,
    },
  );
  window.player.addEventListener("input", ({ data }) => {
    document.getElementById("key").innerHTML = formatKeyCode(data, console);
  });
}
