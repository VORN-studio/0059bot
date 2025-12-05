/*
 screenfull
 v5.0.0 - 2019-09-09
 (c) Sindre Sorhus; MIT License
 Platform.js <https://mths.be/platform>
 Copyright 2014-2018 Benjamin Tan <https://bnjmnt4n.now.sh/>
 Copyright 2011-2013 John-David Dalton
 Available under MIT license <https://mths.be/mit>
*/
! function() {
    var a = "undefined" != typeof window && void 0 !== window.document ? window.document : {},
       b = "undefined" != typeof module && module.exports,
       c = function() {
          for (var g, l = [
                "requestFullscreen exitFullscreen fullscreenElement fullscreenEnabled fullscreenchange fullscreenerror"
                .split(" "),
                "webkitRequestFullscreen webkitExitFullscreen webkitFullscreenElement webkitFullscreenEnabled webkitfullscreenchange webkitfullscreenerror"
                .split(" "),
                "webkitRequestFullScreen webkitCancelFullScreen webkitCurrentFullScreenElement webkitCancelFullScreen webkitfullscreenchange webkitfullscreenerror"
                .split(" "),
                "mozRequestFullScreen mozCancelFullScreen mozFullScreenElement mozFullScreenEnabled mozfullscreenchange mozfullscreenerror"
                .split(" "),
                "msRequestFullscreen msExitFullscreen msFullscreenElement msFullscreenEnabled MSFullscreenChange MSFullscreenError"
                .split(" ")
             ], h = 0, f = l.length, k = {}; h < f; h++)
             if ((g = l[h]) && g[1] in a) {
                for (h = 0; h < g.length; h++) k[l[0][h]] = g[h];
                return k
             }
          return !1
       }(),
       d = {
          change: c.fullscreenchange,
          error: c.fullscreenerror
       },
       e = {
          request: function(g) {
             return new Promise(function(l, h) {
                var f = function() {
                   this.off("change", f);
                   l()
                }.bind(this);
                this.on("change", f);
                g = g || a.documentElement;
                Promise.resolve(g[c.requestFullscreen]())["catch"](h)
             }.bind(this))
          },
          exit: function() {
             return new Promise(function(g, l) {
                if (this.isFullscreen) {
                   var h = function() {
                      this.off("change", h);
                      g()
                   }.bind(this);
                   this.on("change", h);
                   Promise.resolve(a[c.exitFullscreen]())["catch"](l)
                } else g()
             }.bind(this))
          },
          toggle: function(g) {
             return this.isFullscreen ? this.exit() : this.request(g)
          },
          onchange: function(g) {
             this.on("change", g)
          },
          onerror: function(g) {
             this.on("error", g)
          },
          on: function(g, l) {
             var h = d[g];
             h && a.addEventListener(h, l, !1)
          },
          off: function(g, l) {
             var h = d[g];
             h && a.removeEventListener(h, l, !1)
          },
          raw: c
       };
    c ? (Object.defineProperties(e, {
       isFullscreen: {
          get: function() {
             return !!a[c.fullscreenElement]
          }
       },
       element: {
          enumerable: !0,
          get: function() {
             return a[c.fullscreenElement]
          }
       },
       isEnabled: {
          enumerable: !0,
          get: function() {
             return !!a[c.fullscreenEnabled]
          }
       }
    }), b ? module.exports = e : window.screenfull = e) : b ? module.exports = {
       isEnabled: !1
    } : window.screenfull = {
       isEnabled: !1
    }
 }();
 (function() {
    function a(m) {
       m = String(m);
       return m.charAt(0).toUpperCase() + m.slice(1)
    }
 
    function b(m, J) {
       var I = -1,
          E = m ? m.length : 0;
       if ("number" == typeof E && -1 < E && E <= B)
          for (; ++I < E;) J(m[I], I, m);
       else d(m, J)
    }
 
    function c(m) {
       m = String(m).replace(/^ +| +$/g, "");
       return /^(?:webOS|i(?:OS|P))/.test(m) ? m : a(m)
    }
 
    function d(m, J) {
       for (var I in m) D.call(m, I) && J(m[I], I, m)
    }
 
    function e(m) {
       return null == m ? a(m) : F.call(m).slice(8, -1)
    }
 
    function g(m, J) {
       var I = null != m ? typeof m[J] : "number";
       return !/^(?:boolean|number|string|undefined)$/.test(I) && ("object" == I ? !!m[J] : !0)
    }
 
    function l(m) {
       return String(m).replace(/([ -])(?!$)/g, "$1?")
    }
 
    function h(m, J) {
       var I = null;
       b(m, function(E, w) {
          I = J(I, E, w, m)
       });
       return I
    }
 
    function f(m) {
       function J(U) {
          return h(U, function(V, M) {
             var Z = M.pattern || l(M);
             !V && (V = RegExp("\\b" + Z + " *\\d+[.\\w_]*", "i").exec(m) || RegExp("\\b" +
                Z + " *\\w+-[\\w]*", "i").exec(m) || RegExp("\\b" + Z +
                "(?:; *(?:[a-z]+[_-])?[a-z]+\\d+|[^ ();-]*)", "i").exec(m)) && ((V =
                   String(M.label && !RegExp(Z, "i").test(M.label) ? M.label : V).split(
                      "/"))[1] && !/[\d.]+/.test(V[0]) && (V[0] += " " + V[1]), M = M.label ||
                M, V = c(V[0].replace(RegExp(Z, "i"), M).replace(RegExp("; *(?:" + M +
                   "[_-])?", "i"), " ").replace(RegExp("(" + M + ")[-_.]?(\\w)", "i"),
                   "$1 $2")));
             return V
          })
       }
 
       function I(U) {
          return h(U, function(V, M) {
             return V || (RegExp(M +
                "(?:-[\\d.]+/|(?: for [\\w-]+)?[ /-])([\\d.]+[^ ();/_-]*)", "i").exec(
                m) || 0)[1] || null
          })
       }
       var E = u,
          w = m && "object" == typeof m && "String" != e(m);
       w && (E = m, m = null);
       var z = E.navigator || {},
          C = z.userAgent || "";
       m || (m = C);
       var R = w ? !!z.likeChrome : /\bChrome\b/.test(m) && !/internal|\n/i.test(F.toString()),
          S = w ? "Object" : "ScriptBridgingProxyObject",
          y = w ? "Object" : "Environment",
          x = w && E.java ? "JavaPackage" : e(E.java),
          n = w ? "Object" : "RuntimeObject";
       y = (x = /\bJava/.test(x) && E.java) && e(E.environment) == y;
       var L = x ? "a" : "\u03b1",
          ea = x ? "b" : "\u03b2",
          O = E.document || {},
          W = E.operamini || E.opera,
          fa = A.test(fa = w && W ? W["[[Class]]"] : e(W)) ? fa : W = null,
          q, ha = m;
       w = [];
       var ia = null,
          X = m == C;
       C = X && W && "function" == typeof W.version && W.version();
       var P = function(U) {
             return h(U, function(V, M) {
                return V || RegExp("\\b" + (M.pattern || l(M)) + "\\b", "i").exec(m) && (M.label ||
                   M)
             })
          }([{
             label: "EdgeHTML",
             pattern: "Edge"
          }, "Trident", {
             label: "WebKit",
             pattern: "AppleWebKit"
          }, "iCab", "Presto", "NetFront", "Tasman", "KHTML", "Gecko"]),
          G = function(U) {
             return h(U, function(V, M) {
                return V || RegExp("\\b" + (M.pattern || l(M)) + "\\b", "i").exec(m) && (M.label ||
                   M)
             })
          }(["Adobe AIR", "Arora", "Avant Browser", "Breach", "Camino", "Electron", "Epiphany",
             "Fennec", "Flock", "Galeon", "GreenBrowser", "iCab", "Iceweasel", "K-Meleon",
             "Konqueror", "Lunascape", "Maxthon", {
                label: "Microsoft Edge",
                pattern: "Edge"
             }, "Midori", "Nook Browser", "PaleMoon", "PhantomJS", "Raven", "Rekonq",
             "RockMelt", {
                label: "Samsung Internet",
                pattern: "SamsungBrowser"
             }, "SeaMonkey", {
                label: "Silk",
                pattern: "(?:Cloud9|Silk-Accelerated)"
             }, "Sleipnir", "SlimBrowser", {
                label: "SRWare Iron",
                pattern: "Iron"
             }, "Sunrise", "Swiftfox", "Waterfox", "WebPositive", "Opera Mini", {
                label: "Opera Mini",
                pattern: "OPiOS"
             }, "Opera", {
                label: "Opera",
                pattern: "OPR"
             }, "Chrome", {
                label: "Chrome Mobile",
                pattern: "(?:CriOS|CrMo)"
             }, {
                label: "Firefox",
                pattern: "(?:Firefox|Minefield)"
             }, {
                label: "Firefox for iOS",
                pattern: "FxiOS"
             }, {
                label: "IE",
                pattern: "IEMobile"
             }, {
                label: "IE",
                pattern: "MSIE"
             }, "Safari"
          ]),
          Q = J([{
                label: "BlackBerry",
                pattern: "BB10"
             }, "BlackBerry", {
                label: "Galaxy S",
                pattern: "GT-I9000"
             }, {
                label: "Galaxy S2",
                pattern: "GT-I9100"
             }, {
                label: "Galaxy S3",
                pattern: "GT-I9300"
             }, {
                label: "Galaxy S4",
                pattern: "GT-I9500"
             }, {
                label: "Galaxy S5",
                pattern: "SM-G900"
             }, {
                label: "Galaxy S6",
                pattern: "SM-G920"
             }, {
                label: "Galaxy S6 Edge",
                pattern: "SM-G925"
             }, {
                label: "Galaxy S7",
                pattern: "SM-G930"
             }, {
                label: "Galaxy S7 Edge",
                pattern: "SM-G935"
             }, "Google TV", "Lumia", "iPad", "iPod", "iPhone", "Kindle", {
                label: "Kindle Fire",
                pattern: "(?:Cloud9|Silk-Accelerated)"
             }, "Nexus", "Nook", "PlayBook", "PlayStation Vita", "PlayStation", "TouchPad",
             "Transformer", {
                label: "Wii U",
                pattern: "WiiU"
             }, "Wii", "Xbox One", {
                label: "Xbox 360",
                pattern: "Xbox"
             }, "Xoom"
          ]),
          aa = function(U) {
             return h(U, function(V, M, Z) {
                return V || (M[Q] || M[/^[a-z]+(?: +[a-z]+\b)*/i.exec(Q)] || RegExp("\\b" +
                   l(Z) + "(?:\\b|\\w*\\d)", "i").exec(m)) && Z
             })
          }({
             Apple: {
                iPad: 1,
                iPhone: 1,
                iPod: 1
             },
             Archos: {},
             Amazon: {
                Kindle: 1,
                "Kindle Fire": 1
             },
             Asus: {
                Transformer: 1
             },
             "Barnes & Noble": {
                Nook: 1
             },
             BlackBerry: {
                PlayBook: 1
             },
             Google: {
                "Google TV": 1,
                Nexus: 1
             },
             HP: {
                TouchPad: 1
             },
             HTC: {},
             LG: {},
             Microsoft: {
                Xbox: 1,
                "Xbox One": 1
             },
             Motorola: {
                Xoom: 1
             },
             Nintendo: {
                "Wii U": 1,
                Wii: 1
             },
             Nokia: {
                Lumia: 1
             },
             Samsung: {
                "Galaxy S": 1,
                "Galaxy S2": 1,
                "Galaxy S3": 1,
                "Galaxy S4": 1
             },
             Sony: {
                PlayStation: 1,
                "PlayStation Vita": 1
             }
          }),
          v = function(U) {
             return h(U, function(V, M) {
                var Z = M.pattern || l(M);
                if (!V && (V = RegExp("\\b" + Z + "(?:/[\\d.]+|[ \\w.]*)", "i").exec(m))) {
                   var Y = V,
                      ca = M.label || M,
                      r = {
                         "10.0": "10",
                         "6.4": "10 Technical Preview",
                         "6.3": "8.1",
                         "6.2": "8",
                         "6.1": "Server 2008 R2 / 7",
                         "6.0": "Server 2008 / Vista",
                         "5.2": "Server 2003 / XP 64-bit",
                         "5.1": "XP",
                         "5.01": "2000 SP1",
                         "5.0": "2000",
                         "4.0": "NT",
                         "4.90": "ME"
                      };
                   Z && ca && /^Win/i.test(Y) && !/^Windows Phone /i.test(Y) && (r = r[
                      /[\d.]+$/.exec(Y)]) && (Y = "Windows " + r);
                   Y = String(Y);
                   Z && ca && (Y = Y.replace(RegExp(Z, "i"), ca));
                   V = Y = c(Y.replace(/ ce$/i, " CE").replace(/\bhpw/i, "web").replace(
                      /\bMacintosh\b/, "Mac OS").replace(/_PowerPC\b/i, " OS").replace(
                      /\b(OS X) [^ \d]+/i, "$1").replace(/\bMac (OS X)\b/, "$1").replace(
                      /\/(\d)/, " $1").replace(/_/g, ".").replace(
                      /(?: BePC|[ .]*fc[ \d.]+)$/i, "").replace(/\bx86\.64\b/gi,
                      "x86_64").replace(/\b(Windows Phone) OS\b/, "$1").replace(
                      /\b(Chrome OS \w+) [\d.]+\b/, "$1").split(" on ")[0])
                }
                return V
             })
          }(["Windows Phone", "Android", "CentOS", {
                label: "Chrome OS",
                pattern: "CrOS"
             }, "Debian", "Fedora", "FreeBSD", "Gentoo", "Haiku", "Kubuntu", "Linux Mint",
             "OpenBSD", "Red Hat", "SuSE", "Ubuntu", "Xubuntu", "Cygwin", "Symbian OS",
             "hpwOS", "webOS ", "webOS", "Tablet OS", "Tizen", "Linux", "Mac OS X",
             "Macintosh", "Mac", "Windows 98;", "Windows "
          ]);
       P && (P = [P]);
       aa && !Q && (Q = J([aa]));
       if (q = /\bGoogle TV\b/.exec(Q)) Q = q[0];
       /\bSimulator\b/i.test(m) && (Q = (Q ? Q + " " : "") + "Simulator");
       "Opera Mini" == G && /\bOPiOS\b/.test(m) && w.push("running in Turbo/Uncompressed mode");
       "IE" == G && /\blike iPhone OS\b/.test(m) ? (q = f(m.replace(/like iPhone OS/, "")), aa =
             q.manufacturer, Q = q.product) : /^iP/.test(Q) ? (G || (G = "Safari"), v = "iOS" + (
             (q = / OS ([\d_]+)/i.exec(m)) ? " " + q[1].replace(/_/g, ".") : "")) : "Konqueror" !=
          G || /buntu/i.test(v) ? aa && "Google" != aa && (/Chrome/.test(G) && !
             /\bMobile Safari\b/i.test(m) || /\bVita\b/.test(Q)) || /\bAndroid\b/.test(v) &&
          /^Chrome/.test(G) && /\bVersion\//i.test(m) ? (G = "Android Browser", v = /\bAndroid\b/
             .test(v) ? v : "Android") : "Silk" == G ? (/\bMobi/i.test(m) || (v = "Android", w.unshift(
             "desktop mode")), /Accelerated *= *true/i.test(m) && w.unshift("accelerated")) :
          "PaleMoon" == G && (q = /\bFirefox\/([\d.]+)\b/.exec(m)) ? w.push(
             "identifying as Firefox " + q[1]) : "Firefox" == G && (q = /\b(Mobile|Tablet|TV)\b/i
             .exec(m)) ? (v || (v = "Firefox OS"), Q || (Q = q[1])) : !G || (q = !
             /\bMinefield\b/i.test(m) && /\b(?:Firefox|Safari)\b/.exec(G)) ? (G && !Q &&
             /[\/,]|^[^(]+?\)/.test(m.slice(m.indexOf(q + "/") + 8)) && (G = null), (q = Q || aa ||
                v) && (Q || aa || /\b(?:Android|Symbian OS|Tablet OS|webOS)\b/.test(v)) && (G =
                /[a-z]+(?: Hat)?/i.exec(/\bAndroid\b/.test(v) ? v : q) + " Browser")) :
          "Electron" == G && (q = (/\bChrome\/([\d.]+)\b/.exec(m) || 0)[1]) && w.push("Chromium " +
             q) : v = "Kubuntu";
       C || (C = I([
          "(?:Cloud9|CriOS|CrMo|Edge|FxiOS|IEMobile|Iron|Opera ?Mini|OPiOS|OPR|Raven|SamsungBrowser|Silk(?!/[\\d.]+$))",
          "Version", l(G), "(?:Firefox|Minefield|NetFront)"
       ]));
       if (q = "iCab" == P && 3 < parseFloat(C) && "WebKit" || /\bOpera\b/.test(G) && (/\bOPR\b/.test(
             m) ? "Blink" : "Presto") || /\b(?:Midori|Nook|Safari)\b/i.test(m) && !
          /^(?:Trident|EdgeHTML)$/.test(P) && "WebKit" || !P && /\bMSIE\b/i.test(m) && ("Mac OS" ==
             v ? "Tasman" : "Trident") || "WebKit" == P && /\bPlayStation\b(?! Vita\b)/i.test(G) &&
          "NetFront") P = [q];
       "IE" == G && (q = (/; *(?:XBLWP|ZuneWP)(\d+)/i.exec(m) || 0)[1]) ? (G += " Mobile", v =
             "Windows Phone " + (/\+$/.test(q) ? q : q + ".x"), w.unshift("desktop mode")) :
          /\bWPDesktop\b/i.test(m) ? (G = "IE Mobile", v = "Windows Phone 8.x", w.unshift(
             "desktop mode"), C || (C = (/\brv:([\d.]+)/.exec(m) || 0)[1])) : "IE" != G &&
          "Trident" == P && (q = /\brv:([\d.]+)/.exec(m)) && (G && w.push("identifying as " + G +
             (C ? " " + C : "")), G = "IE", C = q[1]);
       if (X) {
          if (g(E, "global"))
             if (x && (q = x.lang.System, ha = q.getProperty("os.arch"), v = v || q.getProperty(
                   "os.name") + " " + q.getProperty("os.version")), y) {
                try {
                   C = E.require("ringo/engine").version.join("."), G = "RingoJS"
                } catch (U) {
                   (q = E.system) && q.global.system == E.system && (G = "Narwhal", v || (v = q[0]
                      .os || null))
                }
                G || (G = "Rhino")
             } else "object" == typeof E.process && !E.process.browser && (q = E.process) && (
                "object" == typeof q.versions && ("string" == typeof q.versions.electron ? (w.push(
                      "Node " + q.versions.node), G = "Electron", C = q.versions.electron) :
                   "string" == typeof q.versions.nw && (w.push("Chromium " + C, "Node " + q.versions
                      .node), G = "NW.js", C = q.versions.nw)), G || (G = "Node.js", ha = q.arch,
                   v = q.platform, C = (C = /[\d.]+/.exec(q.version)) ? C[0] : null));
          else e(q = E.runtime) == S ? (G = "Adobe AIR", v = q.flash.system.Capabilities.os) : e(
                q = E.phantom) == n ? (G = "PhantomJS", C = (q = q.version || null) && q.major +
                "." + q.minor + "." + q.patch) : "number" == typeof O.documentMode && (q =
                /\bTrident\/(\d+)/i.exec(m)) ? (C = [C, O.documentMode], (q = +q[1] + 4) != C[1] &&
                (w.push("IE " + C[1] + " mode"), P && (P[1] = ""), C[1] = q), C = "IE" == G ?
                String(C[1].toFixed(1)) : C[0]) : "number" == typeof O.documentMode &&
             /^(?:Chrome|Firefox)\b/.test(G) && (w.push("masking as " + G + " " + C), G = "IE", C =
                "11.0", P = ["Trident"], v = "Windows");
          v = v && c(v)
       }
       C && (q = /(?:[ab]|dp|pre|[ab]\d+pre)(?:\d+\+?)?$/i.exec(C) || /(?:alpha|beta)(?: ?\d)?/i.exec(
          m + ";" + (X && z.appMinorVersion)) || /\bMinefield\b/i.test(m) && "a") && (ia =
          /b/i.test(q) ? "beta" : "alpha", C = C.replace(RegExp(q + "\\+?$"), "") + ("beta" ==
             ia ? ea : L) + (/\d+\+?/.exec(q) || ""));
       if ("Fennec" == G || "Firefox" == G && /\b(?:Android|Firefox OS)\b/.test(v)) G =
          "Firefox Mobile";
       else if ("Maxthon" == G && C) C = C.replace(/\.[\d.]+/, ".x");
       else if (/\bXbox\b/i.test(Q)) "Xbox 360" == Q && (v = null), "Xbox 360" == Q &&
          /\bIEMobile\b/.test(m) && w.unshift("mobile mode");
       else if (!/^(?:Chrome|IE|Opera)$/.test(G) && (!G || Q || /Browser|Mobi/.test(G)) ||
          "Windows CE" != v && !/Mobi/i.test(m))
          if ("IE" == G && X) try {
             null === E.external && w.unshift("platform preview")
          } catch (U) {
             w.unshift("embedded")
          } else(/\bBlackBerry\b/.test(Q) || /\bBB10\b/.test(m)) && (q = (RegExp(Q.replace(
             / +/g, " *") + "/([.\\d]+)", "i").exec(m) || 0)[1] || C) ? (q = [q, /BB10/.test(
                m)], v = (q[1] ? (Q = null, aa = "BlackBerry") : "Device Software") + " " +
             q[0], C = null) : this != d && "Wii" != Q && (X && W || /Opera/.test(G) &&
             /\b(?:MSIE|Firefox)\b/i.test(m) || "Firefox" == G && /\bOS X (?:\d+\.){2,}/.test(
                v) || "IE" == G && (v && !/^Win/.test(v) && 5.5 < C || /\bWindows XP\b/.test(
                v) && 8 < C || 8 == C && !/\bTrident\b/.test(m))) && !A.test(q = f.call(d,
             m.replace(A, "") + ";")) && q.name && (q = "ing as " + q.name + ((q = q.version) ?
             " " + q : ""), A.test(G) ? (/\bIE\b/.test(q) && "Mac OS" == v && (v = null),
             q = "identify" + q) : (q = "mask" + q, G = fa ? c(fa.replace(
                /([a-z])([A-Z])/g, "$1 $2")) : "Opera", /\bIE\b/.test(q) && (v = null),
             X || (C = null)), P = ["Presto"], w.push(q));
          else G += " Mobile";
       if (q = (/\bAppleWebKit\/([\d.]+\+?)/i.exec(m) || 0)[1]) {
          q = [parseFloat(q.replace(/\.(\d)$/, ".0$1")), q];
          if ("Safari" == G && "+" == q[1].slice(-1)) G = "WebKit Nightly", ia = "alpha", C = q[1]
             .slice(0, -1);
          else if (C == q[1] || C == (q[2] = (/\bSafari\/([\d.]+\+?)/i.exec(m) || 0)[1])) C =
             null;
          q[1] = (/\bChrome\/([\d.]+)/i.exec(m) || 0)[1];
          537.36 == q[0] && 537.36 == q[2] && 28 <= parseFloat(q[1]) && "WebKit" == P && (P = [
             "Blink"
          ]);
          X && (R || q[1]) ? (P && (P[1] = "like Chrome"), q = q[1] || (q = q[0], 530 > q ? 1 :
             532 > q ? 2 : 532.05 > q ? 3 : 533 > q ? 4 : 534.03 > q ? 5 : 534.07 > q ? 6 :
             534.1 > q ? 7 : 534.13 > q ? 8 : 534.16 > q ? 9 : 534.24 > q ? 10 : 534.3 > q ?
             11 : 535.01 > q ? 12 : 535.02 > q ? "13+" : 535.07 > q ? 15 : 535.11 > q ? 16 :
             535.19 > q ? 17 : 536.05 > q ? 18 : 536.1 > q ? 19 : 537.01 > q ? 20 : 537.11 >
             q ? "21+" : 537.13 > q ? 23 : 537.18 > q ? 24 : 537.24 > q ? 25 : 537.36 > q ?
             26 : "Blink" != P ? "27" : "28")) : (P && (P[1] = "like Safari"), q = (q = q[0],
             400 > q ? 1 : 500 > q ? 2 : 526 > q ? 3 : 533 > q ? 4 : 534 > q ? "4+" : 535 >
             q ? 5 : 537 > q ? 6 : 538 > q ? 7 : 601 > q ? 8 : "8"));
          P && (P[1] += " " + (q += "number" == typeof q ? ".x" : /[.+]/.test(q) ? "" : "+"));
          "Safari" == G && (!C || 45 < parseInt(C)) && (C = q)
       }
       "Opera" == G && (q = /\bzbov|zvav$/.exec(v)) ? (G += " ", w.unshift("desktop mode"),
          "zvav" == q ? (G += "Mini", C = null) : G += "Mobile", v = v.replace(RegExp(" *" + q +
             "$"), "")) : "Safari" == G && /\bChrome\b/.exec(P && P[1]) && (w.unshift(
          "desktop mode"), G = "Chrome Mobile", C = null, /\bOS X\b/.test(v) ? (aa =
          "Apple", v = "iOS 4.3+") : v = null);
       C && 0 == C.indexOf(q = /[\d.]+$/.exec(v)) && -1 < m.indexOf("/" + q + "-") && (v = String(
          v.replace(q, "")).replace(/^ +| +$/g, ""));
       P && !/\b(?:Avant|Nook)\b/.test(G) && (/Browser|Lunascape|Maxthon/.test(G) || "Safari" !=
          G && /^iOS/.test(v) && /\bSafari\b/.test(P[1]) ||
          /^(?:Adobe|Arora|Breach|Midori|Opera|Phantom|Rekonq|Rock|Samsung Internet|Sleipnir|Web)/
          .test(G) && P[1]) && (q = P[P.length - 1]) && w.push(q);
       w.length && (w = ["(" + w.join("; ") + ")"]);
       aa && Q && 0 > Q.indexOf(aa) && w.push("on " + aa);
       Q && w.push((/^on /.test(w[w.length - 1]) ? "" : "on ") + Q);
       if (v) {
          var ba = (q = / ([\d.+]+)$/.exec(v)) && "/" == v.charAt(v.length - q[0].length - 1);
          v = {
             architecture: 32,
             family: q && !ba ? v.replace(q[0], "") : v,
             version: q ? q[1] : null,
             toString: function() {
                var U = this.version;
                return this.family + (U && !ba ? " " + U : "") + (64 == this.architecture ?
                   " 64-bit" : "")
             }
          }
       }(q = /\b(?:AMD|IA|Win|WOW|x86_|x)64\b/i.exec(ha)) && !/\bi686\b/i.test(ha) ? (v && (v.architecture =
                64, v.family = v.family.replace(RegExp(" *" + q), "")), G && (/\bWOW64\b/i.test(m) ||
                X && /\w(?:86|32)$/.test(z.cpuClass || z.platform) && !/\bWin64; x64\b/i.test(m)) &&
             w.unshift("32-bit")) : v && /^OS X/.test(v.family) && "Chrome" == G && 39 <=
          parseFloat(C) && (v.architecture = 64);
       m || (m = null);
       E = {};
       E.description = m;
       E.layout = P && P[0];
       E.manufacturer = aa;
       E.name = G;
       E.prerelease = ia;
       E.product = Q;
       E.ua = m;
       E.version = G && C;
       E.os = v || {
          architecture: null,
          family: null,
          version: null,
          toString: function() {
             return "null"
          }
       };
       E.parse = f;
       E.toString = function() {
          return this.description || ""
       };
       E.version && w.unshift(C);
       E.name && w.unshift(G);
       v && G && (v != String(v).split(" ")[0] || v != G.split(" ")[0] && !Q) && w.push(Q ? "(" +
          v + ")" : "on " + v);
       w.length && (E.description = w.join(" "));
       return E
    }
    var k = {
          "function": !0,
          object: !0
       },
       u = k[typeof window] && window || this,
       p = k[typeof exports] && exports;
    k = k[typeof module] && module && !module.nodeType && module;
    var t = p && k && "object" == typeof global && global;
    !t || t.global !== t && t.window !== t && t.self !== t || (u = t);
    var B = Math.pow(2, 53) - 1,
       A = /\bOpera/;
    t = Object.prototype;
    var D = t.hasOwnProperty,
       F = t.toString,
       N = f();
    "function" == typeof define && "object" == typeof define.amd && define.amd ? (u.platform = N,
       define(function() {
          return N
       })) : p && k ? d(N, function(m, J) {
       p[J] = m
    }) : u.platform = N
 }).call(this);
 
 function buildIOSMeta() {
    for (var a = [{
          name: "viewport",
          content: "width=device-width, height=device-height, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no"
       }, {
          name: "apple-mobile-web-app-capable",
          content: "yes"
       }, {
          name: "apple-mobile-web-app-status-bar-style",
          content: "black"
       }], b = 0; b < a.length; b++) {
       var c = document.createElement("meta");
       c.name = a[b].name;
       c.content = a[b].content;
       var d = window.document.head.querySelector('meta[name="' + c.name + '"]');
       d && d.parentNode.removeChild(d);
       window.document.head.appendChild(c)
    }
 }
 
 function hideIOSFullscreenPanel() {
    jQuery(".xxx-ios-fullscreen-message").css("display", "none");
    jQuery(".xxx-ios-fullscreen-scroll").css("display", "none");
    jQuery(".xxx-game-iframe-full").removeClass("xxx-game-iframe-iphone-se")
 }
 
 function buildIOSFullscreenPanel() {
    jQuery("body").append(
       '<div class="xxx-ios-fullscreen-message"><div class="xxx-ios-fullscreen-swipe"></div></div><div class="xxx-ios-fullscreen-scroll"></div>'
    )
 }
 
 function showIOSFullscreenPanel() {
    jQuery(".xxx-ios-fullscreen-message").css("display", "block");
    jQuery(".xxx-ios-fullscreen-scroll").css("display", "block")
 }
 
 function __iosResize() {
    window.scrollTo(0, 0);
    console.log(window.devicePixelRatio);
    console.log(window.innerWidth);
    console.log(window.innerHeight);
    if ("iPhone" === platform.product) switch (window.devicePixelRatio) {
       case 2:
          switch (window.innerWidth) {
             case 568:
                320 !== window.innerHeight && jQuery(".xxx-game-iframe-full").addClass(
                   "xxx-game-iframe-iphone-se");
                break;
             case 667:
                375 === window.innerHeight ? hideIOSFullscreenPanel() : showIOSFullscreenPanel();
                break;
             case 808:
                414 === window.innerHeight ? hideIOSFullscreenPanel() : showIOSFullscreenPanel();
                break;
             default:
                hideIOSFullscreenPanel()
          }
          break;
       case 3:
          switch (window.innerWidth) {
             case 736:
                414 === window.innerHeight ? hideIOSFullscreenPanel() : showIOSFullscreenPanel();
                break;
             case 724:
                375 === window.innerHeight ? hideIOSFullscreenPanel() : showIOSFullscreenPanel();
                break;
             case 808:
                414 === window.innerHeight ? hideIOSFullscreenPanel() : showIOSFullscreenPanel();
                break;
             default:
                hideIOSFullscreenPanel()
          }
          break;
       default:
          hideIOSFullscreenPanel()
    }
 }
 
 function iosResize() {
    __iosResize();
    setTimeout(function() {
       __iosResize()
    }, 500)
 }
 
 function iosInIframe() {
    try {
       return window.self !== window.top
    } catch (a) {
       return !0
    }
 }
 
 function isIOSLessThen13() {
    var a = platform.os,
       b = a.family.toLowerCase();
    a = parseFloat(a.version);
    return "ios" === b && 13 > a ? !0 : !1
 }
 $(document).ready(function() {
    platform && "iPhone" === platform.product && "safari" === platform.name.toLowerCase() &&
       isIOSLessThen13() && !iosInIframe() && (buildIOSFullscreenPanel(), buildIOSMeta())
 });
 jQuery(window).resize(function() {
    platform && "iPhone" === platform.product && "safari" === platform.name.toLowerCase() &&
       isIOSLessThen13() && !iosInIframe() && iosResize()
 });
 var s_iOffsetX, s_iOffsetY, s_iScaleFactor = 1,
    s_bIsIphone = !1,
    s_bLandscape = !0;
 (function(a) {
    (jQuery.browser = jQuery.browser || {}).mobile =
       /android|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(ad|hone|od)|iris|kindle|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|symbian|tablet|treo|up\.(browser|link)|vodafone|wap|webos|windows (ce|phone)|xda|xiino/i
       .test(a) ||
       /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|e\-|e\/|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(di|rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|xda(\-|2|g)|yas\-|your|zeto|zte\-/i
       .test(a.substr(0, 4))
 })(navigator.userAgent || navigator.vendor || window.opera);
 $(window).resize(function() {
    sizeHandler()
 });
 
 function trace(a) {
    console.log(a)
 }
 
 function isChrome() {
    return /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor)
 }
 
 function isIOS() {
    if (isIpad()) return !0;
    for (var a = "iPad Simulator;iPhone Simulator;iPod Simulator;iPad;iPhone;iPod".split(";"); a.length;)
       if (navigator.platform === a.pop()) return s_bIsIphone = !0;
    return s_bIsIphone = !1
 }
 
 function isIpad() {
    var a = -1 !== navigator.userAgent.toLowerCase().indexOf("ipad");
    return !a && navigator.userAgent.match(/Mac/) && navigator.maxTouchPoints && 2 < navigator.maxTouchPoints ?
       !0 : a
 }
 
 function isMobile() {
    return isIpad() ? !0 : navigator.userAgent.match(/Android/i) || navigator.userAgent.match(
          /webOS/i) || navigator.userAgent.match(/iPhone/i) || navigator.userAgent.match(/iPad/i) ||
       navigator.userAgent.match(/iPod/i) || navigator.userAgent.match(/BlackBerry/i) || navigator.userAgent
       .match(/Windows Phone/i) ? !0 : !1
 }
 
 function getSize(a) {
    var b = a.toLowerCase(),
       c = window.document,
       d = c.documentElement;
    if (void 0 === window["inner" + a]) a = d["client" + a];
    else if (window["inner" + a] != d["client" + a]) {
       var e = c.createElement("body");
       e.id = "vpw-test-b";
       e.style.cssText = "overflow:scroll";
       var g = c.createElement("div");
       g.id = "vpw-test-d";
       g.style.cssText = "position:absolute;top:-1000px";
       g.innerHTML = "<style>@media(" + b + ":" + d["client" + a] +
          "px){body#vpw-test-b div#vpw-test-d{" + b + ":7px!important}}</style>";
       e.appendChild(g);
       d.insertBefore(e, c.head);
       a = 7 == g["offset" + a] ? d["client" + a] : window["inner" + a];
       d.removeChild(e)
    } else a = window["inner" + a];
    return a
 }
 window.addEventListener("orientationchange", onOrientationChange);
 
 function onOrientationChange() {
    window.matchMedia("(orientation: portrait)").matches && sizeHandler();
    window.matchMedia("(orientation: landscape)").matches && sizeHandler()
 }
 
 function getIOSWindowHeight() {
    return document.documentElement.clientWidth / window.innerWidth * window.innerHeight
 }
 
 function getHeightOfIOSToolbars() {
    var a = (0 === window.orientation ? screen.height : screen.width) - getIOSWindowHeight();
    return 1 < a ? a : 0
 }
 
 function sizeHandler() {
    window.scrollTo(0, 1);
    if ($("#canvas")) {
       var a = null !== platform.name && "safari" === platform.name.toLowerCase() ?
          getIOSWindowHeight() : getSize("Height");
       var b = getSize("Width"),
          c = Math.min(a / CANVAS_HEIGHT, b / CANVAS_WIDTH);
       b > a ? (EDGEBOARD_X = 0, EDGEBOARD_Y = 470, s_bLandscape = !0) : (EDGEBOARD_X = 470,
          EDGEBOARD_Y = 0, s_bLandscape = !1);
       var d = Math.round(CANVAS_WIDTH * c);
       c = Math.round(CANVAS_HEIGHT * c);
       if (c < a) {
          var e = a - c;
          c += e;
          d += CANVAS_WIDTH / CANVAS_HEIGHT * e
       } else d < b && (e = b - d, d += e, c += CANVAS_HEIGHT / CANVAS_WIDTH * e);
       e = a / 2 - c / 2;
       var g = b / 2 - d / 2,
          l = CANVAS_WIDTH / d;
       if (g * l < -EDGEBOARD_X || e * l < -EDGEBOARD_Y) c = Math.min(a / (CANVAS_HEIGHT - 2 *
             EDGEBOARD_Y), b / (CANVAS_WIDTH - 2 * EDGEBOARD_X)), d = Math.round(CANVAS_WIDTH * c),
          c = Math.round(CANVAS_HEIGHT * c), e = (a - c) / 2, g = (b - d) / 2, l = CANVAS_WIDTH / d;
       s_iOffsetX = -1 * g * l;
       s_iOffsetY = -1 * e * l;
       0 <= e && (s_iOffsetY = 0);
       0 <= g && (s_iOffsetX = 0);
       null !== s_oGame && s_oGame.refreshButtonPos(s_iOffsetX, s_iOffsetY);
       null !== s_oMenu && s_oMenu.refreshButtonPos(s_iOffsetX, s_iOffsetY);
       s_bIsIphone && s_oStage ? (canvas = document.getElementById("canvas"), s_oStage.canvas.width =
          2 * d, s_oStage.canvas.height = 2 * c, canvas.style.width = d + "px", canvas.style.height =
          c + "px", b = Math.min(d / CANVAS_WIDTH, c / CANVAS_HEIGHT), s_iScaleFactor = 2 * b,
          s_oStage.scaleX = s_oStage.scaleY = 2 * b) : s_bMobile || isChrome() ? ($("#canvas").css(
          "width", d + "px"), $("#canvas").css("height", c + "px")) : s_oStage && (s_oStage.canvas
          .width = d, s_oStage.canvas.height = c, s_iScaleFactor = Math.min(d / CANVAS_WIDTH, c /
             CANVAS_HEIGHT), s_oStage.scaleX = s_oStage.scaleY = s_iScaleFactor);
       0 > e || (e = (a - c) / 2);
       $("#canvas").css("top", e + "px");
       $("#canvas").css("left", g + "px");
       fullscreenHandler()
    }
 }
 
 function _checkOrientation(a, b) {
    s_bMobile && ENABLE_CHECK_ORIENTATION && (a > b ? "landscape" === $(".orientation-msg-container")
       .attr("data-orientation") ? ($(".orientation-msg-container").css("display", "none"),
          s_oMain.startUpdate()) : ($(".orientation-msg-container").css("display", "block"),
          s_oMain.stopUpdate()) : "portrait" === $(".orientation-msg-container").attr(
          "data-orientation") ? ($(".orientation-msg-container").css("display", "none"), s_oMain.startUpdate()) :
       ($(".orientation-msg-container").css("display", "block"), s_oMain.stopUpdate()))
 }
 
 function createBitmap(a, b, c) {
    var d = new createjs.Bitmap(a),
       e = new createjs.Shape;
    b && c ? e.graphics.beginFill("#fff").drawRect(0, 0, b, c) : e.graphics.beginFill("#ff0").drawRect(
       0, 0, a.width, a.height);
    d.hitArea = e;
    return d
 }
 
 function createSprite(a, b, c, d, e, g) {
    a = null !== b ? new createjs.Sprite(a, b) : new createjs.Sprite(a);
    b = new createjs.Shape;
    b.graphics.beginFill("#000000").drawRect(-c, -d, e, g);
    a.hitArea = b;
    return a
 }
 
 function randomFloatBetween(a, b, c) {
    "undefined" === typeof c && (c = 2);
    return parseFloat(Math.min(a + Math.random() * (b - a), b).toFixed(c))
 }
 
 function shuffle(a) {
    for (var b = a.length, c, d; 0 !== b;) d = Math.floor(Math.random() * b), --b, c = a[b], a[b] =
       a[d], a[d] = c;
    return a
 }
 
 function interpolate(a, b, c) {
    return {
       x: a.x + (b.x - a.x) * c,
       y: a.y + (b.y - a.y) * c
    }
 }
 
 function formatTime(a) {
    a /= 1E3;
    var b = Math.floor(a / 60);
    a = parseFloat(a - 60 * b).toFixed(1);
    var c = "";
    c = 10 > b ? c + ("0" + b + ":") : c + (b + ":");
    return 10 > a ? c + ("0" + a) : c + a
 }
 
 function NoClickDelay(a) {
    this.element = a;
    window.Touch && this.element.addEventListener("touchstart", this, !1)
 }
 NoClickDelay.prototype = {
    handleEvent: function(a) {
       switch (a.type) {
          case "touchstart":
             this.onTouchStart(a);
             break;
          case "touchmove":
             this.onTouchMove(a);
             break;
          case "touchend":
             this.onTouchEnd(a)
       }
    },
    onTouchStart: function(a) {
       a.preventDefault();
       this.moved = !1;
       this.element.addEventListener("touchmove", this, !1);
       this.element.addEventListener("touchend", this, !1)
    },
    onTouchMove: function(a) {
       this.moved = !0
    },
    onTouchEnd: function(a) {
       this.element.removeEventListener("touchmove", this, !1);
       this.element.removeEventListener("touchend", this, !1);
       if (!this.moved) {
          a = document.elementFromPoint(a.changedTouches[0].clientX, a.changedTouches[0].clientY);
          3 === a.nodeType && (a = a.parentNode);
          var b = document.createEvent("MouseEvents");
          b.initEvent("click", !0, !0);
          a.dispatchEvent(b)
       }
    }
 };
 
 function playSound(a, b, c) {
    return !1 === DISABLE_SOUND_MOBILE || !1 === s_bMobile ? (s_aSounds[a].play(), s_aSounds[a].volume(
       b), s_aSounds[a].loop(c), s_aSounds[a]) : null
 }
 
 function stopSound(a) {
    !1 !== DISABLE_SOUND_MOBILE && !1 !== s_bMobile || s_aSounds[a].stop()
 }
 
 function setVolume(a, b) {
    !1 !== DISABLE_SOUND_MOBILE && !1 !== s_bMobile || s_aSounds[a].volume(b)
 }
 
 function setMute(a, b) {
    !1 !== DISABLE_SOUND_MOBILE && !1 !== s_bMobile || s_aSounds[a].mute(b)
 }
 
 function fadeStopSound(a, b, c, d) {
    !1 !== DISABLE_SOUND_MOBILE && !1 !== s_bMobile || s_aSounds[a].fade(b, c, d)
 }
 
 function isSoundPlaying(a) {
    return !1 === DISABLE_SOUND_MOBILE || !1 === s_bMobile ? s_aSounds[a].playing() : !1
 }
 
 function ctlArcadeResume() {
    null !== s_oMain && s_oMain.startUpdate()
 }
 
 function ctlArcadePause() {
    null !== s_oMain && s_oMain.stopUpdate()
 }
 
 function getParamValue(a) {
    for (var b = window.location.search.substring(1).split("&"), c = 0; c < b.length; c++) {
       var d = b[c].split("=");
       if (d[0] == a) return d[1]
    }
 }
 (function() {
    function a(c) {
       var d = {
          focus: "visible",
          focusin: "visible",
          pageshow: "visible",
          blur: "hidden",
          focusout: "hidden",
          pagehide: "hidden"
       };
       c = c || window.event;
       c.type in d ? document.body.className = d[c.type] : (document.body.className = this[b] ?
          "hidden" : "visible", "hidden" === document.body.className ? s_oMain.stopUpdate() :
          s_oMain.startUpdate())
    }
    var b = "hidden";
    b in document ? document.addEventListener("visibilitychange", a) : (b = "mozHidden") in
       document ? document.addEventListener("mozvisibilitychange", a) : (b = "webkitHidden") in
       document ? document.addEventListener("webkitvisibilitychange", a) : (b = "msHidden") in
       document ? document.addEventListener("msvisibilitychange", a) : "onfocusin" in document ?
       document.onfocusin = document.onfocusout = a : window.onpageshow = window.onpagehide =
       window.onfocus = window.onblur = a
 })();
 
 function fullscreenHandler() {
    ENABLE_FULLSCREEN && screenfull.isEnabled && (s_bFullscreen = screenfull.isFullscreen, null !==
       s_oInterface && s_oInterface.resetFullscreenBut(), null !== s_oMenu && s_oMenu.resetFullscreenBut()
    )
 }
 if (screenfull.isEnabled) screenfull.on("change", function() {
    s_bFullscreen = screenfull.isFullscreen;
    null !== s_oInterface && s_oInterface.resetFullscreenBut();
    null !== s_oMenu && s_oMenu.resetFullscreenBut()
 });
 
 function saveItem(a, b) {
    s_bStorageAvailable && localStorage.setItem(a, b)
 }
 
 function getItem(a) {
    return s_bStorageAvailable ? localStorage.getItem(a) : null
 }
 
 function clearLocalStorage() {
    TOTAL_MONEY = START_MONEY;
    if (s_bStorageAvailable)
       for (var a = 0; null !== localStorage.key(a);) {
          var b = localStorage.key(a); - 1 !== b.indexOf(LOCALSTORAGE_STRING) ? localStorage.removeItem(
             b) : a++
       }
 }
 
 function CSpriteLibrary() {
    var a = {},
       b, c, d, e, g, l;
    this.init = function(h, f, k) {
       b = {};
       d = c = 0;
       e = h;
       g = f;
       l = k
    };
    this.addSprite = function(h, f) {
       if (a.hasOwnProperty(h)) return !1;
       var k = new Image;
       a[h] = b[h] = {
          szPath: f,
          oSprite: k,
          bLoaded: !1
       };
       c++;
       return !0
    };
    this.getSprite = function(h) {
       return a.hasOwnProperty(h) ? a[h].oSprite : null
    };
    this._onSpritesLoaded = function() {
       c = 0;
       g.call(l)
    };
    this._onSpriteLoaded = function() {
       e.call(l);
       ++d === c && this._onSpritesLoaded()
    };
    this.loadSprites = function() {
       for (var h in b) b[h].oSprite.oSpriteLibrary = this,
          b[h].oSprite.szKey = h, b[h].oSprite.onload = function() {
             this.oSpriteLibrary.setLoaded(this.szKey);
             this.oSpriteLibrary._onSpriteLoaded(this.szKey)
          }, b[h].oSprite.onerror = function(f) {
             var k = f.currentTarget;
             setTimeout(function() {
                b[k.szKey].oSprite.src = b[k.szKey].szPath
             }, 500)
          }, b[h].oSprite.src = b[h].szPath
    };
    this.setLoaded = function(h) {
       a[h].bLoaded = !0
    };
    this.isLoaded = function(h) {
       return a[h].bLoaded
    };
    this.getNumSprites = function() {
       return c
    }
 }
 var CANVAS_WIDTH = 1920,
    CANVAS_HEIGHT = 1920,
    EDGEBOARD_X = 0,
    EDGEBOARD_Y = 0,
    FPS = 60,
    FPS_TIME = 1E3 / FPS,
    DISABLE_SOUND_MOBILE = !1,
    DISABLE_SOUND_DESKTOP = !1,
    LOCALSTORAGE_STRING = "slot_black_beard_",
    FONT_GAME_1 = "pirate_scrollregular",
    STATE_LOADING = 0,
    STATE_MENU = 1,
    STATE_GAME = 2,
    GAME_STATE_IDLE = 0,
    GAME_STATE_SPINNING = 1,
    GAME_STATE_SHOW_ALL_WIN = 2,
    GAME_STATE_SHOW_WIN = 3,
    GAME_STATE_BONUS = 4,
    REEL_STATE_START = 0,
    REEL_STATE_MOVING = 1,
    REEL_STATE_STOP = 2,
    SPIN_BUT_STATE_SPIN = "spin",
    SPIN_BUT_STATE_STOP = "stop",
    SPIN_BUT_STATE_AUTOSPIN = "autospin",
    SPIN_BUT_STATE_DISABLE = "disable",
    SPIN_BUT_STATE_FREESPIN = "freespin",
    SPIN_BUT_STATE_SKIP = "skip",
    ON_MOUSE_DOWN = 0,
    ON_MOUSE_UP = 1,
    ON_MOUSE_OVER = 2,
    ON_MOUSE_OUT = 3,
    ON_DRAG_START = 4,
    ON_DRAG_END = 5,
    ON_BUT_YES_DOWN = 7,
    ON_CANNON_ANIM_END = 8,
    BONUS_BUTTON_1 = "up_left",
    BONUS_BUTTON_2 = "center_left",
    BONUS_BUTTON_3 = "down_left",
    BONUS_BUTTON_4 = "up_right",
    BONUS_BUTTON_5 = "center_right",
    BONUS_BUTTON_6 = "down_right",
    REEL_OFFSET_X = CANVAS_WIDTH / 2,
    REEL_OFFSET_Y = CANVAS_HEIGHT / 2,
    START_REEL_OFFSET_X, START_REEL_OFFSET_Y, NUM_REELS = 5,
    NUM_ROWS = 3,
    NUM_SYMBOLS = 10,
    WILD_SYMBOL = 7,
    BONUS_SYMBOL = 9,
    FREESPIN_SYMBOL = 8,
    NUM_PAYLINES = 20,
    SYMBOL_WIDTH = 240,
    SYMBOL_HEIGHT = 230,
    SYMBOL_ANIM_WIDTH = 480,
    SYMBOL_ANIM_HEIGHT = 460,
    WIN_BIG_ANIM_WIDTH = 692,
    WIN_BIG_ANIM_HEIGHT = 752,
    SPACE_BETWEEN_SYMBOLS = 16,
    SPACE_HEIGHT_BETWEEN_SYMBOLS = 0,
    OFFSET_Y_SYMBOLS = 24,
    MAX_FRAMES_REEL_EASE = 24,
    MIN_REEL_LOOPS, SUSPANCE_REEL_LOOPS = 5,
    REEL_DELAY, REEL_START_Y = 80 - 3 * (SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS),
    REEL_ARRIVAL_Y = 80 + 3 * (SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS),
    TIME_SHOW_WIN,
    TIME_SHOW_ALL_WINS = 2E3,
    TIME_SPIN_BUT_CHANGE = 1E3,
    TIME_HOLD_AUTOSPIN = 1E3,
    MIN_TIME_EFFECT_FREESPIN = 600,
    MAX_TIME_EFFECT_FREESPIN = 3E3,
    MAX_BET, TOTAL_MONEY, START_BET, COIN_BET, BONUS_FREESPIN = 1,
    BONUS_GAME = 2,
    REEL_SCALE = 1,
    STATE_BONUS_IDLE = 0,
    STATE_BONUS_KICK = 1,
    STATE_BONUS_WIN = 2,
    STATE_BONUS_LOSE = 3,
    ENABLE_FULLSCREEN, ENABLE_CHECK_ORIENTATION, SOUNDTRACK_VOLUME_IN_GAME = 1,
    RESTART_CREDIT, NUM_SPIN_FOR_ADS, START_MONEY, WIN_OCCURRENCE, FREESPIN_OCCURRENCE,
    BONUS_OCCURRENCE, SLOT_CASH, NUM_FREESPIN, BONUS_PRIZE, BONUS_PRIZE_OCCURRENCE,
    MAX_PRIZES_BONUS = 5,
    COIN_BETS, PAYTABLE_VALUES, _bBonus = !1,
    _bFreespinEnable = !1,
    _iMinWin, _iTotFreeSpin = 0,
    _iNumSymbolFreeSpin = 0,
    _aCbCompleted = [],
    _aCbOwner = [],
    _aSymbolWin = [],
    FREESPIN_NUM_OCCUR, _aPaylineCombo = [],
    _aFinalSymbols;
 
 function APIgetSlotInfos(a, b) {
    a.call(b, {
       start_money: TOTAL_MONEY,
       bets: COIN_BETS,
       start_bet: COIN_BETS[0],
       paytable: PAYTABLE_VALUES
    })
 }
 
 function APIAttemptSpin(a, b, c, d, e) {
    if (a > TOTAL_MONEY) _dieError("INVALID BET: " + a + ",money:" + TOTAL_MONEY, d, e);
    else {
       TOTAL_MONEY -= a;
       SLOT_CASH += a;
       TOTAL_MONEY = parseFloat(TOTAL_MONEY.toFixed(2));
       SLOT_CASH = parseFloat(SLOT_CASH.toFixed(2));
       var g = _bBonus = !1;
       if (SLOT_CASH < _iMinWin * b) generLosingPattern(), !0 === _bFreespinEnable && (_iTotFreeSpin--,
          0 > _iTotFreeSpin && (_iTotFreeSpin = 0, _bFreespinEnable = !1)), a = {
          res: !0,
          win: !1,
          pattern: _aFinalSymbols,
          win_lines: {},
          money: TOTAL_MONEY,
          tot_win: 0,
          freespin: !1,
          num_freespin: _iTotFreeSpin,
          bonus: !1,
          bonus_prize: -1,
          cash: SLOT_CASH
       };
       else if (Math.floor(100 * Math.random()) < WIN_OCCURRENCE) {
          if (!1 === _bFreespinEnable && !1 === _bBonus) {
             var l = Math.floor(100 * Math.random());
             0 === _iTotFreeSpin && l < FREESPIN_OCCURRENCE + BONUS_OCCURRENCE && (l = Math.floor(
                   Math.random() * (FREESPIN_OCCURRENCE + BONUS_OCCURRENCE) + 1), l <=
                FREESPIN_OCCURRENCE ? g = !0 : _bBonus = SLOT_CASH >= BONUS_PRIZE[0] * b ? !0 : !
                1)
          }
          l = 0;
          do {
             generateRandomSymbols(g);
             for (var h = checkWin(g, c), f = 0, k = 0; k < h.length; k++) f += h[k].amount;
             f *= b;
             l++
          } while (0 === h.length || 0 + f > SLOT_CASH || 0 + f < a);
          TOTAL_MONEY += f + 0;
          SLOT_CASH -= f + 0;
          TOTAL_MONEY = parseFloat(TOTAL_MONEY.toFixed(2));
          SLOT_CASH = parseFloat(SLOT_CASH.toFixed(2));
          g && 2 < _iNumSymbolFreeSpin ? (_bFreespinEnable = !0, _iTotFreeSpin = NUM_FREESPIN[
             _iNumSymbolFreeSpin - 3]) : !0 === _bFreespinEnable && (_iTotFreeSpin--, 0 >
             _iTotFreeSpin && (_iTotFreeSpin = 0, _bFreespinEnable = !1));
          a = {
             res: !0,
             win: !0,
             pattern: _aFinalSymbols,
             win_lines: h,
             money: TOTAL_MONEY,
             tot_win: f,
             freespin: g,
             num_freespin: _iTotFreeSpin,
             bonus: _bBonus,
             bonus_prize: -1,
             cash: SLOT_CASH
          }
       } else generLosingPattern(), !0 === _bFreespinEnable && (_iTotFreeSpin--, 0 > _iTotFreeSpin &&
          (_iTotFreeSpin = 0, _bFreespinEnable = !1)), a = {
          res: !0,
          win: !1,
          pattern: _aFinalSymbols,
          win_lines: {},
          money: TOTAL_MONEY,
          tot_win: 0,
          freespin: !1,
          num_freespin: _iTotFreeSpin,
          bonus: !1,
          bonus_prize: -1
       };
       d.call(e, a)
    }
 }
 
 function apiAttemptBonus(a, b, c) {
    for (var d = [], e = 0; e < BONUS_PRIZE_OCCURRENCE.length; e++)
       for (var g = BONUS_PRIZE_OCCURRENCE[e], l = 0; l < g; l++) d.push(e);
    g = Math.floor(Math.random() * MAX_PRIZES_BONUS) + 1;
    l = [];
    var h = 0;
    for (e = 0; e < g; e++) {
       var f = BONUS_PRIZE[d[Math.floor(Math.random() * d.length)]] * a;
       h + f > SLOT_CASH && (f = 0);
       h += f;
       l.push(f);
       TOTAL_MONEY += f;
       SLOT_CASH -= f;
       TOTAL_MONEY = parseFloat(TOTAL_MONEY.toFixed(2));
       SLOT_CASH = parseFloat(SLOT_CASH.toFixed(2))
    }
    0 === l.length && (l = [0], h = 0);
    a = {
       res: !0,
       money: TOTAL_MONEY,
       bonus_win: h,
       prize_list: JSON.stringify(l)
    };
    b.call(c, a)
 }
 
 function checkWin(a, b) {
    for (var c = [], d = 0; d < b; d++) {
       var e = _aPaylineCombo[d],
          g = [],
          l = _aFinalSymbols[e[0].row][e[0].col],
          h = 1,
          f = 1;
       for (g.push({
             row: e[0].row,
             col: e[0].col,
             value: _aFinalSymbols[e[0].row][e[0].col]
          }); l === WILD_SYMBOL && f < NUM_REELS;) h++, l = _aFinalSymbols[e[f].row][e[f].col], g.push({
          row: e[f].row,
          col: e[f].col,
          value: _aFinalSymbols[e[f].row][e[f].col]
       }), f++;
       for (; f < e.length; f++)
          if (_aFinalSymbols[e[f].row][e[f].col] === l || _aFinalSymbols[e[f].row][e[f].col] ===
             WILD_SYMBOL) h++, g.push({
             row: e[f].row,
             col: e[f].col,
             value: _aFinalSymbols[e[f].row][e[f].col]
          });
          else break;
       !(0 < _aSymbolWin[l][h - 1]) || a && l === FREESPIN_SYMBOL || _bBonus && l === BONUS_SYMBOL ||
          (g.sort(sortListByCol), c.push({
             line: d + 1,
             amount: _aSymbolWin[l][h - 1],
             num_win: h,
             value: l,
             list: g
          }))
    }
    if (a) {
       g = [];
       for (d = 0; d < NUM_ROWS; d++)
          for (e = 0; e < NUM_REELS; e++) _aFinalSymbols[d][e] === FREESPIN_SYMBOL && g.push({
             row: d,
             col: e,
             value: FREESPIN_SYMBOL
          });
       g.sort(sortListByCol);
       c.push({
          line: 0,
          amount: 0,
          num_win: g.length,
          value: FREESPIN_SYMBOL,
          list: g
       })
    } else if (_bBonus) {
       g = [];
       for (d = 0; d < NUM_ROWS; d++)
          for (e = 0; e < NUM_REELS; e++) _aFinalSymbols[d][e] === BONUS_SYMBOL && g.push({
             row: d,
             col: e,
             value: BONUS_SYMBOL
          });
       g.sort(sortListByCol);
       c.push({
          line: 0,
          amount: 0,
          num_win: g.length,
          value: BONUS_SYMBOL,
          list: g
       })
    }
    return c
 }
 
 function generateRandomSymbols(a) {
    _aFinalSymbols = [];
    for (var b = 0; b < NUM_ROWS; b++) {
       _aFinalSymbols[b] = [];
       for (var c = 0; c < NUM_REELS; c++) {
          do {
             var d = s_aRandSymbols[Math.floor(Math.random() * s_aRandSymbols.length)];
             _aFinalSymbols[b][c] = d
          } while (d === BONUS_SYMBOL || d === FREESPIN_SYMBOL || 0 == c && d === WILD_SYMBOL)
       }
    }
    if (a) {
       a = [];
       for (b = 0; b < FREESPIN_NUM_OCCUR.length; b++)
          for (c = 0; c < FREESPIN_NUM_OCCUR[b]; c++) a.push(b);
       _iNumSymbolFreeSpin = 3 + a[Math.floor(Math.random() * a.length)];
       b = [0, 1, 2, 3, 4];
       b = shuffle(b);
       for (c = 0; c < _iNumSymbolFreeSpin; c++) a = Math.floor(3 * Math.random()), _aFinalSymbols[a]
          [b[c]] = FREESPIN_SYMBOL
    } else if (_bBonus)
       for (b = [0, 1, 2, 3, 4], b = shuffle(b), d = Math.floor(3 * Math.random() + 3), c = 0; c < d; c++)
          a = Math.floor(3 * Math.random()), _aFinalSymbols[a][b[c]] = BONUS_SYMBOL
 }
 
 function generLosingPattern() {
    for (var a = [], b = 0; b < NUM_ROWS; b++) {
       do var c = Math.floor(Math.random() * s_aRandSymbols.length); while (s_aRandSymbols[c] ===
          BONUS_SYMBOL || s_aRandSymbols[c] === FREESPIN_SYMBOL || s_aRandSymbols[c] === WILD_SYMBOL
       );
       c = s_aRandSymbols[c];
       a[b] = c
    }
    var d = 0,
       e = 0;
    _aFinalSymbols = [];
    for (b = 0; b < NUM_ROWS; b++) {
       _aFinalSymbols[b] = [];
       for (var g = 0; g < NUM_REELS; g++)
          if (0 == g) _aFinalSymbols[b][g] = a[b];
          else {
             do c = Math.floor(Math.random() * s_aRandSymbols.length), c = s_aRandSymbols[c]; while (
                a[0] === c || a[1] === c || a[2] === c || c === BONUS_SYMBOL && 2 === d || c ===
                FREESPIN_SYMBOL && 2 === e || c === WILD_SYMBOL);
             _aFinalSymbols[b][g] = c;
             c === BONUS_SYMBOL ? d++ : c === FREESPIN_SYMBOL && e++
          }
    }
    return _aFinalSymbols
 }
 
 function refreshCredit(a, b, c) {
    TOTAL_MONEY = a;
    b.call(c, TOTAL_MONEY)
 }
 
 function formatEntries(a) {
    return a.toFixed(2)
 }
 
 function _dieError(a, b, c) {
    b.call(c, "res=false&desc=" + a)
 }
 
 function sortListByCol(a, b) {
    return a.col < b.col ? -1 : a.col > b.col ? 1 : 0
 }
 
 function _initSymbolWin() {
    _aSymbolWin = [];
    for (var a = 0; a < PAYTABLE_VALUES.length; a++) {
       _aSymbolWin[a] = [];
       for (var b = 0; b < PAYTABLE_VALUES[a].length; b++) _aSymbolWin[a][b] = PAYTABLE_VALUES[a][b]
    }
    for (a = PAYTABLE_VALUES.length; a < NUM_SYMBOLS; a++) _aSymbolWin[a] = [0, 0, 0, 0, 0]
 }
 
 function _setMinWin() {
    _iMinWin = 9999999999999;
    for (var a = 0; a < _aSymbolWin.length; a++)
       for (var b = _aSymbolWin[a], c = 0; c < b.length; c++) 0 !== b[c] && b[c] < _iMinWin && (
          _iMinWin = b[c])
 }
 
 function _initPaylines() {
    _aPaylineCombo[0] = [{
       row: 1,
       col: 0
    }, {
       row: 1,
       col: 1
    }, {
       row: 1,
       col: 2
    }, {
       row: 1,
       col: 3
    }, {
       row: 1,
       col: 4
    }];
    _aPaylineCombo[1] = [{
       row: 0,
       col: 0
    }, {
       row: 0,
       col: 1
    }, {
       row: 0,
       col: 2
    }, {
       row: 0,
       col: 3
    }, {
       row: 0,
       col: 4
    }];
    _aPaylineCombo[2] = [{
       row: 2,
       col: 0
    }, {
       row: 2,
       col: 1
    }, {
       row: 2,
       col: 2
    }, {
       row: 2,
       col: 3
    }, {
       row: 2,
       col: 4
    }];
    _aPaylineCombo[3] = [{
       row: 0,
       col: 0
    }, {
       row: 1,
       col: 1
    }, {
       row: 2,
       col: 2
    }, {
       row: 1,
       col: 3
    }, {
       row: 0,
       col: 4
    }];
    _aPaylineCombo[4] = [{
       row: 2,
       col: 0
    }, {
       row: 1,
       col: 1
    }, {
       row: 0,
       col: 2
    }, {
       row: 1,
       col: 3
    }, {
       row: 2,
       col: 4
    }];
    _aPaylineCombo[5] = [{
       row: 1,
       col: 0
    }, {
       row: 0,
       col: 1
    }, {
       row: 0,
       col: 2
    }, {
       row: 0,
       col: 3
    }, {
       row: 1,
       col: 4
    }];
    _aPaylineCombo[6] = [{
       row: 1,
       col: 0
    }, {
       row: 2,
       col: 1
    }, {
       row: 2,
       col: 2
    }, {
       row: 2,
       col: 3
    }, {
       row: 1,
       col: 4
    }];
    _aPaylineCombo[7] = [{
       row: 0,
       col: 0
    }, {
       row: 0,
       col: 1
    }, {
       row: 1,
       col: 2
    }, {
       row: 2,
       col: 3
    }, {
       row: 2,
       col: 4
    }];
    _aPaylineCombo[8] = [{
       row: 2,
       col: 0
    }, {
       row: 2,
       col: 1
    }, {
       row: 1,
       col: 2
    }, {
       row: 0,
       col: 3
    }, {
       row: 0,
       col: 4
    }];
    _aPaylineCombo[9] = [{
       row: 1,
       col: 0
    }, {
       row: 2,
       col: 1
    }, {
       row: 1,
       col: 2
    }, {
       row: 0,
       col: 3
    }, {
       row: 1,
       col: 4
    }];
    _aPaylineCombo[10] = [{
       row: 1,
       col: 0
    }, {
       row: 0,
       col: 1
    }, {
       row: 1,
       col: 2
    }, {
       row: 2,
       col: 3
    }, {
       row: 1,
       col: 4
    }];
    _aPaylineCombo[11] = [{
       row: 0,
       col: 0
    }, {
       row: 1,
       col: 1
    }, {
       row: 1,
       col: 2
    }, {
       row: 1,
       col: 3
    }, {
       row: 0,
       col: 4
    }];
    _aPaylineCombo[12] = [{
       row: 2,
       col: 0
    }, {
       row: 1,
       col: 1
    }, {
       row: 1,
       col: 2
    }, {
       row: 1,
       col: 3
    }, {
       row: 2,
       col: 4
    }];
    _aPaylineCombo[13] = [{
       row: 0,
       col: 0
    }, {
       row: 1,
       col: 1
    }, {
       row: 0,
       col: 2
    }, {
       row: 1,
       col: 3
    }, {
       row: 0,
       col: 4
    }];
    _aPaylineCombo[14] = [{
       row: 2,
       col: 0
    }, {
       row: 1,
       col: 1
    }, {
       row: 2,
       col: 2
    }, {
       row: 1,
       col: 3
    }, {
       row: 2,
       col: 4
    }];
    _aPaylineCombo[15] = [{
       row: 1,
       col: 0
    }, {
       row: 1,
       col: 1
    }, {
       row: 0,
       col: 2
    }, {
       row: 1,
       col: 3
    }, {
       row: 1,
       col: 4
    }];
    _aPaylineCombo[16] = [{
       row: 1,
       col: 0
    }, {
       row: 1,
       col: 1
    }, {
       row: 2,
       col: 2
    }, {
       row: 1,
       col: 3
    }, {
       row: 1,
       col: 4
    }];
    _aPaylineCombo[17] = [{
       row: 0,
       col: 0
    }, {
       row: 0,
       col: 1
    }, {
       row: 2,
       col: 2
    }, {
       row: 0,
       col: 3
    }, {
       row: 0,
       col: 4
    }];
    _aPaylineCombo[18] = [{
       row: 2,
       col: 0
    }, {
       row: 2,
       col: 1
    }, {
       row: 0,
       col: 2
    }, {
       row: 2,
       col: 3
    }, {
       row: 2,
       col: 4
    }];
    _aPaylineCombo[19] = [{
       row: 0,
       col: 0
    }, {
       row: 2,
       col: 1
    }, {
       row: 2,
       col: 2
    }, {
       row: 2,
       col: 3
    }, {
       row: 0,
       col: 4
    }];
    return _aPaylineCombo
 }
 
 function initAPI() {
    _initSymbolWin();
    _aPaylineCombo = _initPaylines();
    _setMinWin()
 }
 
 function CSlotSettings() {
    this._init = function() {
       this._initSymbolSpriteSheets();
       this._initSymbolAnims();
       this._initSymbolsOccurence();
       for (var a = [], b = 0; 20 > b; b++) a.push(s_oSpriteLibrary.getSprite("avatar-" + b));
       var c = [];
       for (b = 60; 0 <= b; b--) c.push(b);
       s_oAvatarSpritesheet = new createjs.SpriteSheet({
          images: a,
          framerate: 40,
          frames: [
             [1, 1, 374, 491, 0, 167, 492],
             [377, 1, 374, 491, 0, 167, 492],
             [753, 1, 374, 491, 0, 167, 492],
             [1129, 1, 374, 491, 0, 167, 492],
             [1505, 1, 374, 491, 0, 167, 492],
             [1, 494, 374, 491, 0, 167, 492],
             [377, 494, 374, 491, 0, 167, 492],
             [753, 494, 374, 491, 0, 167, 492],
             [1129, 494, 374, 491, 0, 167, 492],
             [1505, 494, 374, 491, 0, 167, 492],
             [1, 987, 374, 491, 0, 167, 492],
             [377, 987, 374, 491, 0, 167, 492],
             [753, 987, 374, 491, 0, 167, 492],
             [1129, 987, 374, 491, 0, 167, 492],
             [1505, 987, 374, 491, 0, 167, 492],
             [1, 1480, 374, 491, 0, 167, 492],
             [377, 1480, 374, 491, 0, 167, 492],
             [753, 1480, 374, 491, 0, 167, 492],
             [1129, 1480, 374, 491, 0, 167, 492],
             [1505, 1480, 374, 491, 0, 167, 492],
             [1, 1, 374, 491, 1, 167, 492],
             [377, 1, 374, 491, 1, 167, 492],
             [753, 1, 374, 491, 1, 167, 492],
             [1129, 1, 374, 491, 1, 167, 492],
             [1505, 1, 374, 491, 1, 167, 492],
             [1, 494, 374, 491, 1, 167, 492],
             [377, 494, 374, 491, 1, 167, 492],
             [753, 494, 374, 491, 1, 167, 492],
             [1129, 494, 374, 491, 1, 167, 492],
             [1505, 494, 374, 491, 1, 167, 492],
             [1, 987, 374, 491, 1, 167, 492],
             [377, 987, 374, 491, 1, 167, 492],
             [753, 987, 374, 491, 1, 167, 492],
             [1129, 987, 374, 491, 1, 167, 492],
             [1505, 987, 374, 491, 1, 167, 492],
             [1, 1480, 374, 491, 1, 167, 492],
             [377, 1480, 374, 490, 1, 167, 491],
             [753, 1480, 374, 490, 1, 167, 491],
             [1129, 1480, 374, 490, 1, 167, 491],
             [1505, 1480, 374, 490, 1, 167, 491],
             [1, 1, 374, 490, 2, 167, 491],
             [377, 1, 374, 490, 2, 167, 491],
             [753, 1, 374, 490, 2, 167, 491],
             [1129, 1, 374, 490, 2, 167, 491],
             [1505, 1, 374, 490, 2, 167, 491],
             [1, 493, 374, 490, 2, 167, 491],
             [377, 493, 374, 490, 2, 167, 491],
             [753, 493, 374, 490, 2, 167, 491],
             [1129, 493, 374, 490, 2, 167, 491],
             [1505, 493, 374, 490, 2, 167, 491],
             [1, 985, 374, 490, 2, 167, 491],
             [377, 985, 374, 490, 2, 167, 491],
             [753, 985, 374, 490, 2, 167, 491],
             [1129, 985, 374, 490, 2, 167, 491],
             [1505, 985, 374, 490, 2, 167, 491],
             [1, 1477, 374, 490, 2, 167, 491],
             [377, 1477, 374, 490, 2, 167, 491],
             [753, 1477, 374, 490, 2, 167, 491],
             [1129, 1477, 374, 490, 2, 167, 491],
             [1505, 1477, 374, 490, 2, 167, 491],
             [1, 1, 374, 490, 3, 167, 491],
             [377, 1, 391, 492, 3, 178, 492],
             [770, 1, 391, 492, 3, 178, 492],
             [1163, 1, 390, 487, 3, 177, 487],
             [1555, 1, 391, 473, 3, 177, 473],
             [1, 495, 393, 456, 3, 177, 456],
             [396, 495, 393, 442, 3, 177, 442],
             [791, 495, 392, 435, 3, 178, 435],
             [1185, 495, 388, 433, 3, 178, 433],
             [1575, 495, 391, 434, 3, 179, 434],
             [1, 953, 391, 434, 3, 179, 434],
             [394, 953, 392, 434, 3, 179, 434],
             [788, 953, 391, 436, 3, 181, 436],
             [1181, 953, 399, 438, 3, 187, 438],
             [1582, 953, 389, 441, 3, 180, 441],
             [1, 1396, 388, 445, 3, 179, 445],
             [391, 1396, 396, 448, 3, 187, 448],
             [789, 1396, 388, 451, 3, 178, 451],
             [1179, 1396, 389, 452, 3, 177, 452],
             [1570, 1396, 391, 450, 3, 177, 450],
             [1, 1, 393, 446, 4, 176, 446],
             [396, 1, 395, 441, 4, 176, 441],
             [793, 1, 396, 436, 4, 177, 436],
             [1191, 1, 407, 429, 4, 176, 429],
             [1, 449, 489, 422, 4, 177, 422],
             [492, 449, 491, 414, 4, 177, 414],
             [985, 449, 483, 406, 4, 177, 406],
             [1470, 449, 458, 401, 4, 178, 401],
             [1, 873, 392, 398, 4, 178, 398],
             [395, 873, 426, 394, 4, 212, 394],
             [823, 873, 464, 391, 4, 250, 391],
             [1289, 873, 480, 387, 4, 267, 387],
             [1, 1273, 484, 386, 4, 272, 386],
             [487, 1273, 494, 385, 4, 280, 385],
             [983, 1273, 522, 383, 4, 305, 383],
             [1507, 1273, 537, 382, 4, 318, 382],
             [1, 1661, 539, 380, 4, 318, 380],
             [542,
                1661, 537, 380, 4, 312, 380
             ],
             [1081, 1661, 517, 382, 4, 296, 382],
             [1, 1, 496, 385, 5, 275, 385],
             [499, 1, 472, 389, 5, 251, 389],
             [973, 1, 461, 394, 5, 242, 394],
             [1436, 1, 456, 401, 5, 237, 401],
             [1, 404, 449, 407, 5, 231, 407],
             [452, 404, 443, 414, 5, 226, 414],
             [897, 404, 434, 422, 5, 217, 422],
             [1333, 404, 422, 428, 5, 204, 428],
             [1, 834, 411, 434, 5, 192, 434],
             [414, 834, 398, 439, 5, 179, 439],
             [814, 834, 397, 444, 5, 178, 444],
             [1213, 834, 397, 449, 5, 178, 449],
             [1612, 834, 396, 454, 5, 178, 454],
             [1, 1290, 395, 459, 5, 178, 459],
             [398, 1290, 394, 464, 5, 178, 464],
             [794, 1290, 392, 469, 5, 178, 469],
             [1188, 1290,
                391, 473, 5, 178, 473
             ],
             [1581, 1290, 390, 478, 5, 178, 478],
             [1, 1, 389, 481, 6, 177, 481],
             [392, 1, 387, 485, 6, 177, 485],
             [781, 1, 387, 487, 6, 177, 487],
             [1170, 1, 386, 490, 6, 177, 490],
             [1558, 1, 386, 491, 6, 177, 491],
             [1, 494, 384, 492, 6, 177, 492],
             [387, 494, 382, 493, 6, 176, 493],
             [771, 494, 384, 493, 6, 177, 493],
             [1157, 494, 384, 492, 6, 177, 492],
             [1543, 494, 384, 492, 6, 177, 492],
             [1, 989, 384, 492, 6, 177, 492],
             [387, 989, 384, 492, 6, 177, 492],
             [773, 989, 384, 492, 6, 177, 492],
             [1159, 989, 384, 492, 6, 177, 492],
             [1545, 989, 384, 493, 6, 177, 493],
             [1, 1484, 385, 493, 6, 178, 493],
             [388, 1484, 385, 493,
                6, 178, 493
             ],
             [775, 1484, 385, 493, 6, 178, 493],
             [1162, 1484, 385, 494, 6, 178, 494],
             [1549, 1484, 385, 494, 6, 178, 494],
             [1, 1, 385, 494, 7, 178, 494],
             [388, 1, 385, 494, 7, 178, 494],
             [775, 1, 385, 494, 7, 178, 494],
             [1162, 1, 385, 493, 7, 178, 493],
             [1549, 1, 385, 493, 7, 178, 493],
             [1, 497, 388, 493, 7, 178, 493],
             [391, 497, 390, 493, 7, 178, 493],
             [783, 497, 392, 492, 7, 178, 492],
             [1177, 497, 392, 492, 7, 178, 492],
             [1571, 497, 392, 492, 7, 178, 492],
             [1, 992, 392, 492, 7, 178, 492],
             [395, 992, 392, 492, 7, 178, 492],
             [789, 992, 392, 492, 7, 178, 492],
             [1183, 992, 392, 492, 7, 178, 492],
             [1577, 992, 392, 492, 7,
                178, 492
             ],
             [1, 1486, 392, 492, 7, 178, 492],
             [395, 1486, 392, 492, 7, 178, 492],
             [789, 1486, 392, 492, 7, 178, 492],
             [1183, 1486, 392, 491, 7, 178, 491],
             [1577, 1486, 392, 490, 7, 178, 490],
             [1, 1, 392, 490, 8, 178, 490],
             [395, 1, 391, 490, 8, 178, 490],
             [788, 1, 391, 489, 8, 178, 489],
             [1181, 1, 391, 488, 8, 178, 488],
             [1574, 1, 391, 487, 8, 178, 487],
             [1, 493, 391, 487, 8, 178, 487],
             [394, 493, 391, 487, 8, 178, 487],
             [787, 493, 391, 487, 8, 178, 487],
             [1180, 493, 391, 487, 8, 178, 487],
             [1573, 493, 391, 487, 8, 178, 487],
             [1, 982, 391, 487, 8, 178, 487],
             [394, 982, 391, 487, 8, 178, 487],
             [787, 982, 391, 487, 8, 178,
                487
             ],
             [1180, 982, 391, 487, 8, 178, 487],
             [1573, 982, 391, 487, 8, 178, 487],
             [1, 1471, 391, 487, 8, 178, 487],
             [394, 1471, 391, 487, 8, 178, 487],
             [787, 1471, 391, 487, 8, 178, 487],
             [1180, 1471, 391, 487, 8, 178, 487],
             [1573, 1471, 391, 487, 8, 178, 487],
             [1, 1, 391, 487, 9, 178, 487],
             [394, 1, 391, 487, 9, 178, 487],
             [787, 1, 391, 487, 9, 178, 487],
             [1180, 1, 391, 486, 9, 178, 486],
             [1573, 1, 391, 487, 9, 178, 487],
             [1, 490, 391, 487, 9, 178, 487],
             [394, 490, 391, 487, 9, 178, 487],
             [787, 490, 391, 487, 9, 178, 487],
             [1180, 490, 391, 487, 9, 178, 487],
             [1573, 490, 391, 488, 9, 178, 488],
             [1, 980, 391, 488, 9, 178, 488],
             [394, 980, 391, 488, 9, 178, 488],
             [787, 980, 391, 488, 9, 178, 488],
             [1180, 980, 391, 488, 9, 178, 488],
             [1573, 980, 391, 488, 9, 178, 488],
             [1, 1470, 391, 487, 9, 178, 487],
             [394, 1470, 391, 487, 9, 178, 487],
             [787, 1470, 391, 487, 9, 178, 487],
             [1180, 1470, 391, 487, 9, 178, 487],
             [1573, 1470, 391, 487, 9, 178, 487],
             [1, 1, 391, 486, 10, 178, 486],
             [394, 1, 391, 486, 10, 178, 486],
             [787, 1, 391, 486, 10, 178, 486],
             [1180, 1, 391, 486, 10, 178, 486],
             [1573, 1, 391, 486, 10, 178, 486],
             [1, 489, 391, 486, 10, 178, 486],
             [394, 489, 391, 487, 10, 178, 487],
             [787, 489, 391, 487, 10, 178, 487],
             [1180, 489, 391, 488, 10, 178,
                488
             ],
             [1573, 489, 391, 489, 10, 178, 489],
             [1, 980, 391, 490, 10, 178, 490],
             [394, 980, 391, 490, 10, 178, 490],
             [787, 980, 391, 491, 10, 178, 491],
             [1180, 980, 391, 491, 10, 178, 491],
             [1573, 980, 392, 491, 10, 178, 491],
             [1, 1473, 392, 492, 10, 178, 492],
             [395, 1473, 392, 492, 10, 178, 492],
             [789, 1473, 392, 492, 10, 178, 492],
             [1183, 1473, 390, 493, 10, 176, 493],
             [1575, 1473, 391, 493, 10, 176, 493],
             [1, 1, 394, 491, 11, 177, 492],
             [397, 1, 394, 490, 11, 177, 491],
             [793, 1, 394, 488, 11, 177, 490],
             [1189, 1, 394, 482, 11, 177, 485],
             [1585, 1, 394, 514, 11, 177, 519],
             [1, 517, 395, 514, 11, 176, 519],
             [398, 517,
                394, 513, 11, 175, 519
             ],
             [794, 517, 396, 513, 11, 175, 519],
             [1192, 517, 395, 513, 11, 174, 519],
             [1589, 517, 393, 457, 11, 172, 463],
             [1, 1033, 393, 455, 11, 172, 461],
             [396, 1033, 393, 513, 11, 172, 519],
             [791, 1033, 391, 513, 11, 170, 519],
             [1184, 1033, 391, 513, 11, 170, 519],
             [1577, 1033, 391, 513, 11, 170, 519],
             [1, 1, 389, 512, 12, 170, 519],
             [392, 1, 387, 512, 12, 168, 519],
             [781, 1, 398, 512, 12, 179, 519],
             [1181, 1, 422, 512, 12, 203, 519],
             [1605, 1, 429, 505, 12, 210, 513],
             [1, 515, 439, 500, 12, 220, 508],
             [442, 515, 439, 507, 12, 220, 515],
             [883, 515, 439, 510, 12, 220, 518],
             [1324, 515, 438, 521, 12, 220,
                529
             ],
             [1, 1038, 457, 510, 12, 233, 518],
             [460, 1038, 457, 513, 12, 233, 519],
             [919, 1038, 457, 515, 12, 233, 519],
             [1378, 1038, 457, 518, 12, 233, 519],
             [1, 1558, 457, 483, 12, 233, 483],
             [460, 1558, 457, 483, 12, 233, 483],
             [1, 1, 457, 519, 13, 233, 519],
             [460, 1, 457, 519, 13, 233, 519],
             [919, 1, 457, 494, 13, 233, 494],
             [1378, 1, 457, 503, 13, 233, 503],
             [1, 522, 457, 507, 13, 233, 507],
             [460, 522, 457, 519, 13, 233, 519],
             [919, 522, 457, 519, 13, 233, 519],
             [1378, 522, 457, 519, 13, 233, 519],
             [1, 1043, 457, 519, 13, 233, 519],
             [460, 1043, 457, 519, 13, 233, 519],
             [919, 1043, 457, 501, 13, 233, 501],
             [1378, 1043,
                457, 504, 13, 233, 504
             ],
             [1, 1, 457, 505, 14, 233, 505],
             [460, 1, 457, 519, 14, 233, 519],
             [919, 1, 457, 519, 14, 233, 519],
             [1378, 1, 457, 519, 14, 233, 519],
             [1, 522, 457, 510, 14, 233, 510],
             [460, 522, 457, 506, 14, 233, 506],
             [919, 522, 437, 505, 14, 220, 505],
             [1358, 522, 457, 506, 14, 233, 506],
             [1, 1034, 457, 510, 14, 233, 510],
             [460, 1034, 457, 508, 14, 233, 508],
             [919, 1034, 457, 509, 14, 233, 509],
             [1378, 1034, 457, 510, 14, 233, 510],
             [1, 1, 457, 511, 15, 233, 511],
             [460, 1, 457, 519, 15, 233, 519],
             [919, 1, 457, 519, 15, 233, 519],
             [1378, 1, 457, 503, 15, 233, 503],
             [1, 522, 457, 506, 15, 233, 506],
             [460, 522,
                457, 508, 15, 233, 508
             ],
             [919, 522, 457, 508, 15, 233, 508],
             [1378, 522, 457, 519, 15, 233, 519],
             [1, 1043, 457, 519, 15, 233, 519],
             [460, 1043, 457, 519, 15, 233, 519],
             [919, 1043, 457, 517, 15, 233, 517],
             [1378, 1043, 457, 520, 15, 233, 521],
             [1, 1, 457, 524, 16, 233, 525],
             [460, 1, 457, 520, 16, 233, 524],
             [919, 1, 437, 518, 16, 220, 524],
             [1358, 1, 437, 519, 16, 220, 527],
             [1, 527, 437, 519, 16, 220, 529],
             [440, 527, 437, 519, 16, 220, 529],
             [879, 527, 427, 515, 16, 210, 525],
             [1308, 527, 420, 471, 16, 203, 481],
             [1, 1048, 396, 468, 16, 179, 478],
             [399, 1048, 377, 458, 16, 160, 468],
             [778, 1048, 376, 459, 16, 160,
                469
             ],
             [1156, 1048, 376, 509, 16, 160, 519],
             [1534, 1048, 373, 509, 16, 160, 519],
             [1, 1, 372, 509, 17, 160, 519],
             [375, 1, 372, 461, 17, 160, 471],
             [749, 1, 371, 461, 17, 160, 471],
             [1122, 1, 370, 462, 17, 160, 472],
             [1494, 1, 370, 509, 17, 160, 519],
             [1, 512, 370, 509, 17, 160, 519],
             [373, 512, 370, 509, 17, 160, 519],
             [745, 512, 369, 465, 17, 160, 475],
             [1116, 512, 372, 467, 17, 163, 477],
             [1490, 512, 372, 472, 17, 163, 478],
             [1, 1023, 374, 473, 17, 165, 479],
             [377, 1023, 373, 475, 17, 163, 481],
             [752, 1023, 375, 517, 17, 165, 519],
             [1129, 1023, 375, 517, 17, 165, 519],
             [1506, 1023, 381, 517, 17, 168, 519],
             [1, 1,
                385, 518, 18, 169, 519
             ],
             [388, 1, 386, 518, 18, 170, 519],
             [776, 1, 385, 518, 18, 170, 519],
             [1163, 1, 384, 489, 18, 170, 489],
             [1549, 1, 383, 519, 18, 170, 519],
             [1, 522, 383, 519, 18, 170, 519],
             [386, 522, 384, 519, 18, 172, 519],
             [772, 522, 384, 519, 18, 172, 519],
             [1158, 522, 385, 519, 18, 172, 519],
             [1545, 522, 384, 519, 18, 172, 519],
             [1, 1043, 384, 499, 18, 172, 499],
             [387, 1043, 387, 519, 18, 174, 519],
             [776, 1043, 387, 519, 18, 174, 519],
             [1165, 1043, 387, 519, 18, 174, 519],
             [1554, 1043, 386, 501, 18, 174, 501],
             [1, 1, 387, 501, 19, 175, 501],
             [390, 1, 388, 501, 19, 175, 501],
             [780, 1, 388, 501, 19, 175, 501],
             [1170, 1, 388, 502, 19, 175, 502],
             [1560, 1, 389, 502, 19, 176, 502],
             [1, 505, 389, 502, 19, 176, 502],
             [392, 505, 389, 519, 19, 176, 519],
             [783, 505, 389, 519, 19, 176, 519],
             [1174, 505, 389, 519, 19, 177, 519],
             [1565, 505, 389, 492, 19, 177, 492],
             [1, 1026, 390, 492, 19, 177, 492],
             [393, 1026, 390, 492, 19, 177, 492],
             [785, 1026, 390, 492, 19, 177, 492],
             [1177, 1026, 390, 492, 19, 177, 492],
             [1569, 1026, 391, 492, 19, 178, 492]
          ],
          animations: {
             idle: [0, 60, "idle_reverse"],
             idle_reverse: {
                frames: c,
                next: "idle"
             },
             win_0: [61, 144, "idle"],
             win_1: [145, 213, "idle"],
             start_freespin: [214, 252, "freespin_loop"],
             freespin_loop: [253, 277],
             end_freespin: [278, 340, "idle"]
          }
       })
    };
    this._initSymbolSpriteSheets = function() {
       s_aSymbolData = [];
       for (var a = 0; a < NUM_SYMBOLS; a++) {
          var b = s_oSpriteLibrary.getSprite("symbol_" + a);
          s_aSymbolData[a] = new createjs.SpriteSheet({
             images: [b],
             frames: {
                width: SYMBOL_WIDTH,
                height: b.height,
                regX: 0,
                regY: 0
             },
             animations: {
                "static": 0,
                moving: 1
             }
          })
       }
    };
    this._initSymbolsOccurence = function() {
       s_aRandSymbols = [];
       var a;
       for (a = 0; 1 > a; a++) s_aRandSymbols.push(9);
       for (a = 0; 2 > a; a++) s_aRandSymbols.push(8);
       for (a = 0; 3 > a; a++) s_aRandSymbols.push(7);
       for (a = 0; 4 > a; a++) s_aRandSymbols.push(6);
       for (a = 0; 5 > a; a++) s_aRandSymbols.push(5);
       for (a = 0; 6 > a; a++) s_aRandSymbols.push(4);
       for (a = 0; 7 > a; a++) s_aRandSymbols.push(3);
       for (a = 0; 8 > a; a++) s_aRandSymbols.push(2), s_aRandSymbols.push(1), s_aRandSymbols.push(
          0)
    };
    this._initSymbolAnims = function() {
       s_aSymbolAnims = [];
       for (var a = 0; a < NUM_SYMBOLS; a++) {
          var b = {
             framerate: FPS,
             images: [s_oSpriteLibrary.getSprite("symbol_" + a + "_0"), s_oSpriteLibrary.getSprite(
                   "symbol_" + a + "_1"), s_oSpriteLibrary.getSprite("symbol_" + a + "_2"),
                s_oSpriteLibrary.getSprite("symbol_" + a + "_3"), s_oSpriteLibrary.getSprite(
                   "symbol_" + a + "_4"), s_oSpriteLibrary.getSprite("symbol_" + a + "_5"),
                s_oSpriteLibrary.getSprite("symbol_" + a + "_6"), s_oSpriteLibrary.getSprite(
                   "symbol_" + a + "_7"), s_oSpriteLibrary.getSprite("symbol_" + a + "_8")
             ],
             frames: {
                width: SYMBOL_ANIM_WIDTH,
                height: SYMBOL_ANIM_HEIGHT
             },
             animations: {
                "static": 0,
                anim: [0, 139]
             }
          };
          s_aSymbolAnims[a] = new createjs.SpriteSheet(b)
       }
    };
    this._init()
 }
 var s_aSymbolData, s_aPaylineCombo, s_aSymbolAnims, s_aRandSymbols, s_oAvatarSpritesheet;
 
 function CMenu() {
    var a, b, c, d, e, g, l, h, f, k, u, p, t = null,
       B = null,
       A, D, F, N, m, J, I, E;
    this._init = function() {
       fadeStopSound("soundtrack_menu", 0, 1, 3E3);
       A = createBitmap(s_oSpriteLibrary.getSprite("bg_menu"));
       s_oAttachSection.addChild(A);
       for (var w = [], z = 0; 5 > z; z++) w.push(s_oSpriteLibrary.getSprite("logo_menu-" + z));
       w = new createjs.SpriteSheet({
          images: w,
          framerate: 24,
          frames: [
             [1, 1, 957, 404, 0, 480, 202],
             [960, 1, 957, 404, 0, 480, 202],
             [1, 407, 957, 400, 0, 480, 198],
             [960, 407, 957, 404, 0, 480, 202],
             [1, 813, 957, 404, 0, 480, 202],
             [960, 813, 957, 404,
                0, 480, 202
             ],
             [1, 1219, 957, 404, 0, 480, 202],
             [960, 1219, 957, 404, 0, 480, 202],
             [1, 1625, 957, 404, 0, 480, 202],
             [960, 1625, 957, 404, 0, 480, 202],
             [1, 1, 957, 394, 1, 480, 192],
             [960, 1, 957, 398, 1, 480, 196],
             [1, 401, 957, 385, 1, 480, 183],
             [960, 401, 960, 393, 1, 480, 191],
             [1, 796, 957, 404, 1, 480, 202],
             [960, 796, 957, 404, 1, 480, 202],
             [1, 1202, 958, 385, 1, 480, 183],
             [961, 1202, 960, 395, 1, 480, 193],
             [1, 1599, 960, 403, 1, 480, 201],
             [963, 1599, 960, 404, 1, 480, 202],
             [1, 1, 957, 399, 2, 480, 197],
             [960, 1, 957, 396, 2, 480, 194],
             [1, 402, 957, 404, 2, 480, 202],
             [960, 402, 957, 404, 2, 480, 202],
             [1, 808,
                957, 404, 2, 480, 202
             ],
             [960, 808, 957, 404, 2, 480, 202],
             [1, 1214, 959, 404, 2, 480, 202],
             [962, 1214, 960, 404, 2, 480, 202],
             [1, 1620, 960, 403, 2, 480, 201],
             [963, 1620, 960, 404, 2, 480, 202],
             [1, 1, 960, 403, 3, 480, 201],
             [963, 1, 957, 404, 3, 480, 202],
             [1, 407, 957, 404, 3, 480, 202],
             [960, 407, 957, 404, 3, 480, 202],
             [1, 813, 957, 395, 3, 480, 193],
             [960, 813, 957, 393, 3, 480, 191],
             [1, 1210, 957, 404, 3, 480, 202],
             [960, 1210, 957, 404, 3, 480, 202],
             [1, 1616, 957, 404, 3, 480, 202],
             [960, 1616, 957, 383, 3, 480, 181],
             [1, 1, 957, 386, 4, 480, 184],
             [960, 1, 957, 404, 4, 480, 202],
             [1, 407, 957, 404, 4, 480, 202],
             [960, 407, 957, 404, 4, 480, 202],
             [1, 813, 957, 404, 4, 480, 202],
             [960, 813, 957, 404, 4, 480, 202],
             [1, 1219, 957, 393, 4, 480, 191],
             [960, 1219, 957, 402, 4, 480, 200],
             [1, 1623, 957, 400, 4, 480, 198],
             [960, 1623, 957, 398, 4, 480, 196]
          ],
          animations: {
             idle: 0,
             anim: [0, 49]
          }
       });
       w = createSprite(w, "anim");
       w.x = CANVAS_WIDTH / 2;
       w.y = CANVAS_HEIGHT / 2 - 150;
       w.alpha = 0;
       w.scale = 0;
       s_oAttachSection.addChild(w);
       z = s_oSpriteLibrary.getSprite("but_play");
       e = CANVAS_WIDTH / 2;
       g = CANVAS_HEIGHT - 350;
       c = CANVAS_WIDTH / 2;
       d = CANVAS_HEIGHT - 200;
       D = new CGfxButton(e, g, z, s_oAttachSection);
       D.addEventListener(ON_MOUSE_UP, this._onButPlayRelease, this);
       D.pulseAnimation();
       if (!1 === DISABLE_SOUND_MOBILE || !1 === s_bMobile) z = s_oSpriteLibrary.getSprite(
          "audio_icon"), u = CANVAS_WIDTH - z.width / 4 - 4, p = z.height / 2 + 4, N = new CToggle(
          u, p, z, s_bAudioActive), N.addEventListener(ON_MOUSE_UP, this._onAudioToggle, this);
       SHOW_CREDITS ? (z = s_oSpriteLibrary.getSprite("but_credits"), a = z.width / 2 + 4, b = z.height /
          2 + 4, m = new CGfxButton(a, b, z, s_oAttachSection), m.addEventListener(ON_MOUSE_UP,
             this._onButCreditsRelease, this), f = a + z.width + 4, k = b) : (f = z.width / 2 +
          4, k = z.height / 2 + 4);
       z = window.document;
       var C = z.documentElement;
       t = C.requestFullscreen || C.mozRequestFullScreen || C.webkitRequestFullScreen || C.msRequestFullscreen;
       B = z.exitFullscreen || z.mozCancelFullScreen || z.webkitExitFullscreen || z.msExitFullscreen;
       !1 === ENABLE_FULLSCREEN && (t = !1);
       t && screenfull.isEnabled && (z = s_oSpriteLibrary.getSprite("but_fullscreen"), J = new CToggle(
          f, k, z, s_bFullscreen, s_oAttachSection), J.addEventListener(ON_MOUSE_UP, this._onFullscreenRelease,
          this));
       z = s_oSpriteLibrary.getSprite("but_delete_savings");
       l = z.width / 2 + 4;
       h = CANVAS_HEIGHT - z.height / 2 - 4;
       F = new CGfxButton(l, h, z, s_oAttachSection);
       F.addEventListener(ON_MOUSE_UP, this._onDeleteSavings, this);
       s_bStorageAvailable ? !RESTART_CREDIT && getItem(LOCALSTORAGE_STRING + "score") ?
          TOTAL_MONEY = parseFloat(getItem(LOCALSTORAGE_STRING + "score")) : F.setVisible(!1) : (
             s_oMsgBox.show(TEXT_ERR_LS), F.setVisible(!1));
       E = new CAreYouSurePanel;
       E.addEventListener(ON_BUT_YES_DOWN, this._onExitYes, this);
       I = new createjs.Shape;
       I.graphics.beginFill("black").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       s_oAttachSection.addChild(I);
       createjs.Tween.get(I).to({
          alpha: 0
       }, 400).call(function() {
          I.visible = !1
       });
       this.refreshButtonPos();
       createjs.Tween.get(w).to({
          alpha: 1
       }, 800, createjs.Ease.quintOut);
       createjs.Tween.get(w).to({
          scale: 1
       }, 800, createjs.Ease.backOut)
    };
    this.unload = function() {
       D.unload();
       D = null;
       F.unload();
       if (!1 === DISABLE_SOUND_MOBILE || !1 === s_bMobile) N.unload(), N = null;
       SHOW_CREDITS && m.unload();
       t && screenfull.isEnabled && J.unload();
       s_oAttachSection.removeChild(A);
       A = null;
       s_oAttachSection.removeChild(I);
       s_oMenu = I = null
    };
    this.refreshButtonPos = function() {
       !1 !== DISABLE_SOUND_MOBILE && !1 !== s_bMobile || N.setPosition(u - s_iOffsetX,
          s_iOffsetY + p);
       SHOW_CREDITS && m.setPosition(a + s_iOffsetX, b + s_iOffsetY);
       t && screenfull.isEnabled && J.setPosition(f + s_iOffsetX, k + s_iOffsetY);
       F.setPosition(l + s_iOffsetX, h - s_iOffsetY);
       s_bLandscape ? D.setPosition(c, d - s_iOffsetY) : D.setPosition(e, g - s_iOffsetY)
    };
    this._onButPlayRelease = function() {
       this.unload();
       $(s_oMain).trigger("start_session");
       s_oMain.gotoGame()
    };
    this._onAudioToggle = function() {
       Howler.mute(s_bAudioActive);
       s_bAudioActive = !s_bAudioActive
    };
    this._onButCreditsRelease = function() {
       new CCreditsPanel
    };
    this.resetFullscreenBut = function() {
       t && screenfull.isEnabled && J.setActive(s_bFullscreen)
    };
    this._onFullscreenRelease = function() {
       s_bFullscreen ? B.call(window.document) : t.call(window.document.documentElement);
       sizeHandler()
    };
    this._onDeleteSavings = function() {
       E.show(TEXT_DELETE_SAVINGS + ": " + START_MONEY + TEXT_CURRENCY + "\n" + TEXT_ARE_SURE)
    };
    this._onExitYes = function() {
       clearLocalStorage();
       F.setVisible(!1);
       
    };
    s_oMenu = this;
    this._init()
 }
 var s_oMenu = null;
 
 function CCreditsPanel() {
    var a, b, c, d, e, g, l, h, f = this;
    this._init = function() {
       h = new createjs.Container;
       s_oStage.addChild(h);
       c = new createjs.Shape;
       b = c.on("click", function() {});
       c.alpha = 0;
       c.graphics.beginFill("black").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       h.addChild(c);
       d = new createjs.Container;
       h.addChild(d);
       var k = s_oSpriteLibrary.getSprite("msg_box");
       l = createBitmap(k);
       l.regX = k.width / 2;
       l.regY = k.height / 2;
       d.addChild(l);
       a = l.on("click", this._onLogoButRelease);
       d.x = CANVAS_WIDTH / 2;
       d.y = CANVAS_HEIGHT / 2;
       k = new createjs.Text("www.interalt.net", "52px " + FONT_GAME_1, "#dab977");
       k.y = 40;
       k.textAlign = "center";
       k.textBaseline = "alphabetic";
       k.lineWidth = 300;
       d.addChild(k);
       k = s_oSpriteLibrary.getSprite("ctl_logo");
       g = createBitmap(k);
       g.y = -150;
       g.regX = k.width / 2;
       g.regY = k.height / 2;
       d.addChild(g);
       k = s_oSpriteLibrary.getSprite("but_yes");
       e = new CGfxButton(0, 200, k, d);
       e.addEventListener(ON_MOUSE_UP, this.hide, this);
       d.scale = 0;
       c.alpha = 0;
       createjs.Tween.get(c).to({
          alpha: .7
       }, 300, createjs.Ease.quartOut);
       createjs.Tween.get(d).to({
          scale: 1
       }, 1E3, createjs.Ease.elasticOut)
    };
    this.unload = function() {
       createjs.Tween.get(h).to({
          alpha: 0
       }, 500).call(function() {
          s_oStage.removeChild(h);
          e.unload()
       });
       c.off("click", b);
       l.off("click", a)
    };
    this._onLogoButRelease = function() {
       window.open("https://www.interalt.net", "_blank")
    };
    this.hide = function() {
       e.disable();
       createjs.Tween.get(c).to({
          alpha: 0
       }, 500, createjs.Ease.quartOut);
       createjs.Tween.get(d).to({
          scale: 0
       }, 500, createjs.Ease.backIn).call(function() {
          f.unload()
       })
    };
    this._init()
 }
 
 function CAreYouSurePanel() {
    var a, b, c, d, e, g, l, h, f, k, u = this;
    this._init = function() {
       a = [];
       b = [];
       f = new createjs.Container;
       f.visible = !1;
       s_oStage.addChild(f);
       k = new createjs.Shape;
       c = k.on("click", function() {});
       k.alpha = 0;
       k.graphics.beginFill("black").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       f.addChild(k);
       var p = s_oSpriteLibrary.getSprite("msg_box_small");
       h = new createjs.Container;
       h.x = CANVAS_WIDTH / 2;
       h.y = CANVAS_HEIGHT / 2;
       h.regX = .5 * p.width;
       h.regY = .5 * p.height;
       f.addChild(h);
       d = createBitmap(p);
       h.addChild(d);
       e = new CTLText(h, 50, 60, p.width - 100, 180, 90, "center", "#dab977", FONT_GAME_1, 1, 0,
          0, TEXT_ARE_SURE, !0, !0, !0, !1);
       g = new CGfxButton(p.width - 130, 380, s_oSpriteLibrary.getSprite("but_yes"), h);
       g.addEventListener(ON_MOUSE_UP, this._onButYes, this);
       l = new CGfxButton(130, 380, s_oSpriteLibrary.getSprite("but_no"), h);
       l.addEventListener(ON_MOUSE_UP, this._onButNo, this);
       this.disableButtons()
    };
    this.addEventListener = function(p, t, B) {
       a[p] = t;
       b[p] = B
    };
    this.disableButtons = function() {
       g.disable();
       l.disable()
    };
    this.enableButtons = function() {
       l.enable();
       g.enable()
    };
    this.show = function(p) {
       e.refreshText(p);
       f.visible = !0;
       h.scale = 0;
       k.alpha = 0;
       createjs.Tween.get(k).to({
          alpha: .7
       }, 300, createjs.Ease.quartOut);
       createjs.Tween.get(h).to({
          scale: 1
       }, 1E3, createjs.Ease.elasticOut).call(function() {
          u.enableButtons()
       })
    };
    this.hide = function(p) {
       s_oMain.startUpdateNoBlock();
       createjs.Tween.get(k).to({
          alpha: 0
       }, 500, createjs.Ease.quartOut);
       createjs.Tween.get(h).to({
          scale: 0
       }, 500, createjs.Ease.backIn).call(function() {
          f.visible = !1;
          p && a[ON_BUT_YES_DOWN] && a[ON_BUT_YES_DOWN].call(b[ON_BUT_YES_DOWN])
       })
    };
    this.unload = function() {
       l.unload();
       g.unload();
       k.off("click", c)
    };
    this._onButYes = function() {
       u.disableButtons();
       u.hide(!0)
    };
    this._onButNo = function() {
       u.disableButtons();
       u.hide(!1)
    };
    this._init()
 }
 CTLText.prototype = {
    constructor: CTLText,
    __autofit: function() {
       if (this._bFitText) {
          for (var a = this._iFontSize;
             (this._oText.getBounds().height > this._iHeight - 2 * this._iPaddingV || this._oText
                .getBounds().width > this._iWidth - 2 * this._iPaddingH) && !(a--, this._oText
                .font = a + "px " + this._szFont, this._oText.lineHeight = Math.round(a * this
                   ._fLineHeightFactor), this.__updateY(), this.__verticalAlign(), 8 > a););
          this._iFontSize = a
       }
    },
    __verticalAlign: function() {
       if (this._bVerticalAlign) {
          var a = this._oText.getBounds().height;
          this._oText.y -= (a - this._iHeight) / 2 + this._iPaddingV
       }
    },
    __updateY: function() {
       this._oText.y = this._y + this._iPaddingV;
       switch (this._oText.textBaseline) {
          case "middle":
             this._oText.y += this._oText.lineHeight / 2 + (this._iFontSize * this._fLineHeightFactor -
                this._iFontSize)
       }
    },
    __createText: function(a) {
       this._bDebug && (this._oDebugShape = new createjs.Shape, this._oDebugShape.graphics.beginFill(
             "rgba(255,0,0,0.5)").drawRect(this._x, this._y, this._iWidth, this._iHeight),
          this._oContainer.addChild(this._oDebugShape));
       this._oText = new createjs.Text(a, this._iFontSize + "px " + this._szFont, this._szColor);
       this._oText.textBaseline = "middle";
       this._oText.lineHeight = Math.round(this._iFontSize * this._fLineHeightFactor);
       this._oText.textAlign = this._szAlign;
       this._oText.lineWidth = this._bMultiline ? this._iWidth - 2 * this._iPaddingH : null;
       switch (this._szAlign) {
          case "center":
             this._oText.x = this._x + this._iWidth / 2;
             break;
          case "left":
             this._oText.x = this._x + this._iPaddingH;
             break;
          case "right":
             this._oText.x = this._x + this._iWidth - this._iPaddingH
       }
       this._oContainer.addChild(this._oText);
       this.refreshText(a)
    },
    setVerticalAlign: function(a) {
       this._bVerticalAlign = a
    },
    setOutline: function(a) {
       null !== this._oText && (this._oText.outline = a)
    },
    setShadow: function(a, b, c, d) {
       null !== this._oText && (this._oText.shadow = new createjs.Shadow(a, b, c, d))
    },
    setColor: function(a) {
       this._oText.color = a
    },
    setAlpha: function(a) {
       this._oText.alpha = a
    },
    setY: function(a) {
       this._y = this._oText.y = a
    },
    removeTweens: function() {
       createjs.Tween.removeTweens(this._oText)
    },
    getText: function() {
       return this._oText
    },
    getString: function() {
       return this._oText.text
    },
    getY: function() {
       return this._y
    },
    getFontSize: function() {
       return this._iFontSize
    },
    refreshText: function(a) {
       "" === a && (a = " ");
       null === this._oText && this.__createText(a);
       this._oText.text = a;
       this._oText.font = this._iFontSize + "px " + this._szFont;
       this._oText.lineHeight = Math.round(this._iFontSize * this._fLineHeightFactor);
       this.__autofit();
       this.__updateY();
       this.__verticalAlign()
    }
 };
 
 function CTLText(a, b, c, d, e, g, l, h, f, k, u, p, t, B, A, D, F) {
    this._oContainer = a;
    this._x = b;
    this._y = c;
    this._iWidth = d;
    this._iHeight = e;
    this._bMultiline = D;
    this._iFontSize = g;
    this._szAlign = l;
    this._szColor = h;
    this._szFont = f;
    this._iPaddingH = u;
    this._iPaddingV = p;
    this._bVerticalAlign = A;
    this._bFitText = B;
    this._bDebug = F;
    this._oDebugShape = null;
    this._fLineHeightFactor = k;
    this._oText = null;
    t && this.__createText(t)
 }
 
 function CPreloader() {
    var a, b, c, d, e, g, l, h, f;
    this._init = function() {
       s_oSpriteLibrary.init(this._onImagesLoaded, this._onAllImagesLoaded, this);
       s_oSpriteLibrary.addSprite("progress_bar", "./sprites/progress_bar.png");
       s_oSpriteLibrary.addSprite("200x200", "./sprites/200x200.jpg");
       s_oSpriteLibrary.loadSprites();
       f = new createjs.Container;
       s_oStage.addChild(f)
    };
    this.unload = function() {
       f.removeAllChildren()
    };
    this._onImagesLoaded = function() {};
    this._onAllImagesLoaded = function() {
       this.attachSprites();
       s_oMain.preloaderReady()
    };
    this.attachSprites = function() {
       var k = new createjs.Shape;
       k.graphics.beginFill("black").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       f.addChild(k);
       k = s_oSpriteLibrary.getSprite("200x200");
       l = createBitmap(k);
       l.regX = .5 * k.width;
       l.regY = .5 * k.height;
       l.x = CANVAS_WIDTH / 2;
       l.y = CANVAS_HEIGHT / 2 - 120;
       f.addChild(l);
       h = new createjs.Shape;
       h.graphics.beginFill("rgba(0,0,0,0.01)").drawRoundRect(l.x - 100, l.y - 100, 200, 200, 10);
       f.addChild(h);
       l.mask = h;
       k = s_oSpriteLibrary.getSprite("progress_bar");
       d = createBitmap(k);
       d.x = CANVAS_WIDTH / 2 - k.width / 2;
       d.y = CANVAS_HEIGHT / 2 + 50;
       f.addChild(d);
       a = k.width;
       b = k.height;
       e = new createjs.Shape;
       e.graphics.beginFill("rgba(0,0,0,0.01)").drawRect(d.x, d.y, 1, b);
       f.addChild(e);
       d.mask = e;
       c = new createjs.Text("", "30px " + FONT_GAME_1, "#dab977");
       c.x = CANVAS_WIDTH / 2;
       c.y = CANVAS_HEIGHT / 2 + 120;
       c.textBaseline = "alphabetic";
       c.textAlign = "center";
       f.addChild(c);
       g = new createjs.Shape;
       g.graphics.beginFill("black").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       f.addChild(g);
       createjs.Tween.get(g).to({
          alpha: 0
       }, 500).call(function() {
          createjs.Tween.removeTweens(g);
          f.removeChild(g)
       })
    };
    this.refreshLoader = function(k) {
       c.text = k + "%";
       100 === k && (s_oMain._onRemovePreloader(), c.visible = !1, d.visible = !1);
       e.graphics.clear();
       k = Math.floor(k * a / 100);
       e.graphics.beginFill("rgba(0,0,0,0.01)").drawRect(d.x, d.y, k, b)
    };
    this._init()
 }
 
 function CMain(a) {
    var b, c = 0,
       d = 0,
       e = STATE_LOADING,
       g, l;
    this.initContainer = function() {
       var f = document.getElementById("canvas");
       s_oStage = new createjs.Stage(f);
       s_oAttachSection = new createjs.Container;
       s_oStage.addChild(s_oAttachSection);
       s_oStage.preventSelection = !1;
       s_bMobile = isMobile();
       !1 === s_bMobile ? s_oStage.enableMouseOver(20) : createjs.Touch.enable(s_oStage, !0);
       s_iPrevTime = (new Date).getTime();
       createjs.Ticker.framerate = FPS;
       createjs.Ticker.addEventListener("tick", this._update);
       navigator.userAgent.match(/Windows Phone/i) && (DISABLE_SOUND_MOBILE = !0);
       s_oSpriteLibrary = new CSpriteLibrary;
       seekAndDestroy() ? g = new CPreloader : window.location.href =
          "https://www.interalt.net"
    };
    this.preloaderReady = function() {
       this._loadImages();
       (!1 === DISABLE_SOUND_DESKTOP && !1 === s_bMobile || !0 === s_bMobile && !1 ===
          DISABLE_SOUND_MOBILE) && this._initSounds();
       b = !0
    };
    this.soundLoaded = function() {
       c++;
       g.refreshLoader(Math.floor(c / d * 100))
    };
    this._initSounds = function() {
       Howler.mute(!s_bAudioActive);
       s_aSoundsInfo = [];
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "ambience_game",
          loop: !0,
          volume: 1,
          ingamename: "ambience_game"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "press_but",
          loop: !1,
          volume: 1,
          ingamename: "press_but"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "reel_stop",
          loop: !1,
          volume: 1,
          ingamename: "reel_stop"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "reel_stop_bonus",
          loop: !1,
          volume: 1,
          ingamename: "reel_stop_bonus"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "reel_stop_freespin",
          loop: !1,
          volume: 1,
          ingamename: "reel_stop_freespin"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "start_reel",
          loop: !1,
          volume: 1,
          ingamename: "start_reel"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "spin_but",
          loop: !1,
          volume: 1,
          ingamename: "spin_but"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol0",
          loop: !1,
          volume: 1,
          ingamename: "symbol0"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol1",
          loop: !1,
          volume: 1,
          ingamename: "symbol1"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol2",
          loop: !1,
          volume: 1,
          ingamename: "symbol2"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol3",
          loop: !1,
          volume: 1,
          ingamename: "symbol3"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol4",
          loop: !1,
          volume: 1,
          ingamename: "symbol4"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol5",
          loop: !1,
          volume: 1,
          ingamename: "symbol5"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol6",
          loop: !1,
          volume: 1,
          ingamename: "symbol6"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol7",
          loop: !1,
          volume: 1,
          ingamename: "symbol7"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol8",
          loop: !1,
          volume: 1,
          ingamename: "symbol8"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "symbol9",
          loop: !1,
          volume: 1,
          ingamename: "symbol9"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "avatar_win_0",
          loop: !1,
          volume: 1,
          ingamename: "avatar_win_0"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "avatar_win_1",
          loop: !1,
          volume: 1,
          ingamename: "avatar_win_1"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "end_bonus",
          loop: !1,
          volume: 1,
          ingamename: "end_bonus"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "bonus_soundtrack",
          loop: !0,
          volume: 1,
          ingamename: "bonus_soundtrack"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "soundtrack_menu",
          loop: !0,
          volume: 1,
          ingamename: "soundtrack_menu"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "freespin_soundtrack",
          loop: !0,
          volume: 1,
          ingamename: "freespin_soundtrack"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "bonus_game_cannon_fire",
          loop: !1,
          volume: 1,
          ingamename: "bonus_game_cannon_fire"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "bonus_game_enemy_hit",
          loop: !1,
          volume: 1,
          ingamename: "bonus_game_enemy_hit"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "bonus_game_water_splash",
          loop: !1,
          volume: 1,
          ingamename: "bonus_game_water_splash"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "avatar_start_freespins",
          loop: !1,
          volume: 1,
          ingamename: "avatar_start_freespins"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "score_counter",
          loop: !1,
          volume: 1,
          ingamename: "score_counter"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "suspance",
          loop: !0,
          volume: 1,
          ingamename: "suspance"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "bonus_game_enemy_scream_0",
          loop: !1,
          volume: 1,
          ingamename: "bonus_game_enemy_scream_0"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "bonus_game_enemy_scream_1",
          loop: !1,
          volume: 1,
          ingamename: "bonus_game_enemy_scream_1"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "bonus_notify_lose",
          loop: !1,
          volume: 1,
          ingamename: "bonus_notify_lose"
       });
       s_aSoundsInfo.push({
          path: "./sounds/",
          filename: "start_bonus",
          loop: !1,
          volume: 1,
          ingamename: "start_bonus"
       });
       d += s_aSoundsInfo.length;
       s_aSounds = [];
       for (var f = 0; f < s_aSoundsInfo.length; f++) this.tryToLoadSound(s_aSoundsInfo[f], !1)
    };
    this.tryToLoadSound = function(f, k) {
       setTimeout(function() {
          s_aSounds[f.ingamename] = new Howl({
             src: [f.path + f.filename + ".mp3"],
             autoplay: !1,
             preload: !0,
             loop: f.loop,
             volume: f.volume,
             onload: s_oMain.soundLoaded,
             onloaderror: function(u, p) {
                for (var t = 0; t < s_aSoundsInfo.length; t++)
                   if (0 < s_aSounds[s_aSoundsInfo[t].ingamename]._sounds.length &&
                      u === s_aSounds[s_aSoundsInfo[t].ingamename]._sounds[0]._id) {
                      s_oMain.tryToLoadSound(s_aSoundsInfo[t], !0);
                      break
                   } else document.querySelector("#block_game").style.display =
                      "none"
             },
             onplayerror: function(u) {
                for (var p = 0; p < s_aSoundsInfo.length; p++)
                   if (u === s_aSounds[s_aSoundsInfo[p].ingamename]._sounds[0]._id) {
                      s_aSounds[s_aSoundsInfo[p].ingamename].once("unlock",
                         function() {
                            s_aSounds[s_aSoundsInfo[p].ingamename].play();
                            "ambience_game" === s_aSoundsInfo[p].ingamename &&
                               null !== s_oGame && setVolume("ambience_game",
                                  SOUNDTRACK_VOLUME_IN_GAME)
                         });
                      break
                   }
             }
          })
       }, k ? 200 : 0)
    };
    this._loadImages = function() {
       s_oSpriteLibrary.init(this._onImagesLoaded, this._onAllImagesLoaded, this);
       s_oSpriteLibrary.addSprite("bg_game", "./sprites/bg_game.jpg");
       s_oSpriteLibrary.addSprite("paytable1_landscape", "./sprites/paytable1_landscape.png");
       s_oSpriteLibrary.addSprite("paytable2_landscape", "./sprites/paytable2_landscape.png");
       s_oSpriteLibrary.addSprite("paytable3_landscape", "./sprites/paytable3_landscape.png");
       s_oSpriteLibrary.addSprite("paytable4_landscape", "./sprites/paytable4_landscape.png");
       s_oSpriteLibrary.addSprite("paytable1_portrait", "./sprites/paytable1_portrait.png");
       s_oSpriteLibrary.addSprite("paytable2_portrait", "./sprites/paytable2_portrait.png");
       s_oSpriteLibrary.addSprite("paytable3_portrait", "./sprites/paytable3_portrait.png");
       s_oSpriteLibrary.addSprite("paytable4_portrait", "./sprites/paytable4_portrait.png");
       s_oSpriteLibrary.addSprite("mask_slot", "./sprites/mask_slot.png");
       s_oSpriteLibrary.addSprite("mask_slot_freespins", "./sprites/mask_slot_freespins.png");
       s_oSpriteLibrary.addSprite("win_frame_anim", "./sprites/win_frame_anim.png");
       s_oSpriteLibrary.addSprite("but_text", "./sprites/but_text.png");
       s_oSpriteLibrary.addSprite("but_text_big", "./sprites/but_text_big.png");
       s_oSpriteLibrary.addSprite("msg_box", "./sprites/msg_box.png");
       s_oSpriteLibrary.addSprite("msg_box_small", "./sprites/msg_box_small.png");
       s_oSpriteLibrary.addSprite("msg_box_win", "./sprites/msg_box_win.png");
       s_oSpriteLibrary.addSprite("but_arrow_next", "./sprites/but_arrow_next.png");
       s_oSpriteLibrary.addSprite("but_arrow_prev", "./sprites/but_arrow_prev.png");
       s_oSpriteLibrary.addSprite("logo", "./sprites/logo.png");
       s_oSpriteLibrary.addSprite("bg_loading_bonus", "./sprites/bg_loading_bonus.jpg");
       s_oSpriteLibrary.addSprite("but_exit_info", "./sprites/but_exit_info.png");
       s_oSpriteLibrary.addSprite("bg_ship_0", "./sprites/bg_ship_0.png");
       s_oSpriteLibrary.addSprite("bg_ship_1", "./sprites/bg_ship_1.jpg");
       s_oSpriteLibrary.addSprite("bg_ship_freespin", "./sprites/bg_ship_freespin.png");
       s_oSpriteLibrary.addSprite("bg_freespin", "./sprites/bg_freespin.jpg");
       s_oSpriteLibrary.addSprite("bg_cable_freespin", "./sprites/bg_cable_freespin.png");
       s_oSpriteLibrary.addSprite("bg_cable", "./sprites/bg_cable.png");
       s_oSpriteLibrary.addSprite("amount_freespins", "./sprites/amount_freespins.png");
       s_oSpriteLibrary.addSprite("amount_freespin_win", "./sprites/amount_freespin_win.png");
       s_oSpriteLibrary.addSprite("amount_bonus_win", "./sprites/amount_bonus_win.png");
       for (var f = 0; f < NUM_SYMBOLS; f++) {
          s_oSpriteLibrary.addSprite("symbol_" + f, "./sprites/symbol_" + f + ".png");
          for (var k = 0; 9 > k; k++) s_oSpriteLibrary.addSprite("symbol_" + f + "_" + k,
             "./sprites/symbols/symbol_" + f + "_" + k + ".jpg")
       }
       for (f = 0; 17 > f; f++) s_oSpriteLibrary.addSprite("win_frame_anim_big_" + f,
          "./sprites/win_frame_anim_big_" + f + ".png");
       s_oSpriteLibrary.addSprite("bet_but", "./sprites/paylines/bet_but.png");
       s_oSpriteLibrary.addSprite("but_credits", "./sprites/but_credits.png");
       s_oSpriteLibrary.addSprite("but_delete_savings", "./sprites/but_delete_savings.png");
       s_oSpriteLibrary.addSprite("but_exit", "./sprites/but_exit.png");
       s_oSpriteLibrary.addSprite("but_fullscreen", "./sprites/but_fullscreen.png");
       s_oSpriteLibrary.addSprite("but_no", "./sprites/but_no.png");
       s_oSpriteLibrary.addSprite("but_play", "./sprites/but_play.png");
       s_oSpriteLibrary.addSprite("but_yes", "./sprites/but_yes.png");
       s_oSpriteLibrary.addSprite("ctl_logo", "./sprites/ctl_logo.png");
       s_oSpriteLibrary.addSprite("but_credits", "./sprites/but_credits.png");
       s_oSpriteLibrary.addSprite("audio_icon", "./sprites/audio_icon.png");
       s_oSpriteLibrary.addSprite("bg_menu", "./sprites/bg_menu.jpg");
       s_oSpriteLibrary.addSprite("bg_loading_bonus_text", "./sprites/bg_loading_bonus_text.png");
       for (k = 0; 5 > k; k++) s_oSpriteLibrary.addSprite("logo_menu-" + k,
          "./sprites/logo_menu-" + k + ".png");
       s_oSpriteLibrary.addSprite("bg_avatar_portrait", "./sprites/bg_avatar_portrait.jpg");
       s_oSpriteLibrary.addSprite("bg_avatar_portrait_freespin",
          "./sprites/bg_avatar_portrait_freespin.jpg");
       for (f = 1; f < NUM_PAYLINES + 1; f++) s_oSpriteLibrary.addSprite("payline_" + f,
          "./sprites/paylines/payline_" + f + ".png");
       for (f = 0; 20 > f; f++) s_oSpriteLibrary.addSprite("avatar-" + f,
          "./sprites/avatar/avatar-" + f + ".png");
       for (f = 0; 6 > f; f++) s_oSpriteLibrary.addSprite("suspance_reel_" + f,
          "./sprites/suspance_reel_" + f + ".png");
       d += s_oSpriteLibrary.getNumSprites();
       s_oSpriteLibrary.loadSprites()
    };
    this._onImagesLoaded = function() {
       c++;
       g.refreshLoader(Math.floor(c / d * 100))
    };
    this._onAllImagesLoaded = function() {};
    this._onRemovePreloader = function() {
       APIgetSlotInfos(this.settingPhase, this)
    };
    this.settingPhase = function(f) {
       try {
          saveItem(LOCALSTORAGE_STRING + "ls_available", "ok")
       } catch (k) {
          s_bStorageAvailable = !1
       }
       s_oGameSettings = new CSlotSettings;
       s_oMsgBox = new CMsgBox;
       g.unload();
       COIN_BET = f.bets;
       START_BET = f.start_bet;
       MIN_BET = f.bets[0];
       MIN_REEL_LOOPS = h.min_reel_loop;
       REEL_DELAY = h.reel_delay;
       TIME_SHOW_WIN = h.time_show_win;
       TIME_SHOW_ALL_WINS = h.time_show_all_wins;
       ENABLE_FULLSCREEN = a.fullscreen;
       SHOW_CREDITS = a.show_credits;
       ENABLE_CHECK_ORIENTATION = a.check_orientation;
       PAYTABLE_VALUES = f.paytable;
       playSound("soundtrack_menu", 0, !0);
       this.gotoMenu()
    };
    this.gotoMenu = function() {
       _oMenu = new CMenu;
       e = STATE_MENU
    };
    this.gotoGame = function() {
       l = new CGame(h);
       e = STATE_GAME
    };
    this.stopUpdate = function() {
       b = !1;
       createjs.Ticker.paused = !0;
       $("#block_game").css("display", "block");
       !1 !== DISABLE_SOUND_MOBILE && !1 !== s_bMobile || Howler.mute(!0)
    };
    this.startUpdate = function() {
       s_iPrevTime = (new Date).getTime();
       b = !0;
       createjs.Ticker.paused = !1;
       $("#block_game").css("display", "none");
       (!1 === DISABLE_SOUND_MOBILE || !1 === s_bMobile) && s_bAudioActive && Howler.mute(!1)
    };
    this.stopUpdateNoBlock = function() {
       b = !1;
       createjs.Ticker.paused = !0
    };
    this.startUpdateNoBlock = function() {
       s_iPrevTime = (new Date).getTime();
       b = !0;
       createjs.Ticker.paused = !1
    };
    this._update = function(f) {
       if (!1 !== b) {
          var k = (new Date).getTime();
          s_iTimeElaps = k - s_iPrevTime;
          s_iCntTime += s_iTimeElaps;
          s_iCntFps++;
          s_iPrevTime = k;
          1E3 <= s_iCntTime && (s_iCurFps = s_iCntFps, s_iCntTime -= 1E3, s_iCntFps = 0);
          e === STATE_GAME && l.update();
          s_oStage.update(f)
       }
    };
    s_oMain = this;
    var h = a;
    ENABLE_CHECK_ORIENTATION = h.check_orientation;
    NUM_SPIN_FOR_ADS = a.num_spin_for_ads;
    RESTART_CREDIT = a.restart_credit;
    s_bAudioActive = a.audio_enable_on_startup;
    TOTAL_MONEY = START_MONEY = a.start_credit;
    WIN_OCCURRENCE = a.win_occurrence;
    FREESPIN_OCCURRENCE = a.freespin_occur;
    BONUS_OCCURRENCE = a.bonus_occur;
    SLOT_CASH = a.slot_cash;
    NUM_FREESPIN = a.num_freespin;
    BONUS_PRIZE = a.bonus_prize;
    BONUS_PRIZE_OCCURRENCE = a.bonus_prize_occur;
    COIN_BETS = a.coin_bets;
    PAYTABLE_VALUES = a.paytable;
    FREESPIN_NUM_OCCUR = a.freespin_num_occur;
    initAPI();
    this.initContainer()
 }
 var s_bMobile, s_bFullscreen = !1,
    s_iCntTime = 0,
    s_iTimeElaps = 0,
    s_iPrevTime = 0,
    s_iCntFps = 0,
    s_iCurFps = 0,
    s_oDrawLayer, s_oStage, s_oAttachSection, s_oMain, s_oSpriteLibrary, s_oMsgBox, s_oGameSettings,
    s_aSounds, s_aSoundsInfo, s_bStorageAvailable = !0;
 
 function CSpriteSheetTextButton(a, b, c, d, e, g, l, h) {
    var f, k, u, p, t, B, A, D, F, N, m, J;
    this._init = function(I, E, w, z, C, R, S, y) {
       f = !1;
       p = R;
       t = [];
       B = [];
       J = y;
       k = w.width / 2;
       u = w.height;
       F = new createjs.Container;
       F.x = I;
       F.y = E;
       F.regX = k / 2;
       F.regY = u / 2;
       F.cursor = "pointer";
       J.addChild(F);
       I = new createjs.SpriteSheet({
          images: [w],
          frames: {
             width: k,
             height: u
          },
          animations: {
             state_enable: 0,
             state_disable: 1
          }
       });
       N = createSprite(I, "state_enable", 0, 0, k, u);
       F.addChild(N);
       m = new CTLText(F, 10, 10, k - 20, u - 10, S, "center", R, C, 1, 0, 0, z, !0, !0, !1, !1);
       this._initListener()
    };
    this.unload = function() {
       F.off("mousedown", A);
       F.off("pressup", D);
       J.removeChild(F)
    };
    this.setVisible = function(I) {
       F.visible = I
    };
    this.enable = function() {
       f = !1;
       N.gotoAndStop("state_enable");
       m.setColor(p)
    };
    this.disable = function() {
       f = !0;
       N.gotoAndStop("state_disable");
       m.setColor("#636363")
    };
    this.setText = function(I) {
       m.refreshText(I)
    };
    this._initListener = function() {
       A = F.on("mousedown", this.buttonDown);
       D = F.on("pressup", this.buttonRelease)
    };
    this.addEventListener = function(I, E, w) {
       t[I] = E;
       B[I] = w
    };
    this.buttonRelease = function() {
       f || (playSound("press_but", 1, !1), F.scaleX = 1, F.scaleY = 1, t[ON_MOUSE_UP] && t[
          ON_MOUSE_UP].call(B[ON_MOUSE_UP], m.getString()))
    };
    this.buttonDown = function() {
       f || (F.scaleX = .9, F.scaleY = .9, t[ON_MOUSE_DOWN] && t[ON_MOUSE_DOWN].call(B[
          ON_MOUSE_DOWN], m.getString()))
    };
    this.setPosition = function(I, E) {
       F.x = I;
       F.y = E
    };
    this.changeText = function(I) {
       m.refreshText(I)
    };
    this.setX = function(I) {
       F.x = I
    };
    this.setY = function(I) {
       F.y = I
    };
    this.getButtonImage = function() {
       return F
    };
    this.getX = function() {
       return F.x
    };
    this.getY = function() {
       return F.y
    };
    this.getText = function() {
       return m.getString()
    };
    this._init(a, b, c, d, e, g, l, h);
    return this
 }
 
 function CGfxButton(a, b, c, d) {
    var e, g, l, h, f, k, u, p, t;
    this._init = function(B, A, D, F) {
       e = !1;
       g = 1;
       l = [];
       h = [];
       t = createBitmap(D);
       t.x = B;
       t.y = A;
       t.scaleX = t.scaleY = g;
       t.regX = D.width / 2;
       t.regY = D.height / 2;
       F.addChild(t);
       this._initListener()
    };
    this.unload = function() {
       t.off("mousedown", k);
       t.off("pressup", u);
       s_bMobile || t.off("mouseover", p);
       createjs.Tween.removeTweens(t);
       d.removeChild(t)
    };
    this.setVisible = function(B) {
       t.visible = B
    };
    this.enable = function() {
       e = !1
    };
    this.disable = function() {
       e = !0
    };
    this._initListener = function() {
       k = t.on("mousedown", this.buttonDown);
       u = t.on("pressup", this.buttonRelease);
       s_bMobile || (p = t.on("mouseover", this.buttonOver))
    };
    this.addEventListener = function(B, A, D) {
       l[B] = A;
       h[B] = D
    };
    this.addEventListenerWithParams = function(B, A, D, F) {
       l[B] = A;
       h[B] = D;
       f = F
    };
    this.buttonRelease = function() {
       e || (t.scaleX = g, t.scaleY = g, playSound("press_but", 1, !1), l[ON_MOUSE_UP] && l[
          ON_MOUSE_UP].call(h[ON_MOUSE_UP], f))
    };
    this.buttonDown = function() {
       e || (t.scaleX = .9 * g, t.scaleY = .9 * g, createjs.Tween.removeTweens(t), l[
          ON_MOUSE_DOWN] && l[ON_MOUSE_DOWN].call(h[ON_MOUSE_DOWN], f))
    };
    this.buttonOver = function(B) {
       s_bMobile || e || (B.target.cursor = "pointer")
    };
    this.pulseAnimation = function() {
       createjs.Tween.get(t, {
          loop: -1
       }).to({
          scaleX: 1.1 * g,
          scaleY: 1.1 * g
       }, 850, createjs.Ease.quadOut).to({
          scaleX: g,
          scaleY: g
       }, 650, createjs.Ease.quadIn)
    };
    this.moveY = function(B, A, D, F) {
       createjs.Tween.get(t).wait(D).to({
          y: B
       }, A, F)
    };
    this.setPosition = function(B, A) {
       t.x = B;
       t.y = A
    };
    this.setX = function(B) {
       t.x = B
    };
    this.setY = function(B) {
       t.y = B
    };
    this.getButtonImage = function() {
       return t
    };
    this.getX = function() {
       return t.x
    };
    this.getY = function() {
       return t.y
    };
    this._init(a, b, c, d);
    return this
 }
 
 function CToggle(a, b, c, d, e) {
    var g, l, h, f, k, u, p;
    this._init = function(t, B, A, D, F) {
       p = void 0 !== F ? F : s_oStage;
       l = [];
       h = [];
       F = new createjs.SpriteSheet({
          images: [A],
          frames: {
             width: A.width / 2,
             height: A.height,
             regX: A.width / 2 / 2,
             regY: A.height / 2
          },
          animations: {
             state_true: [0],
             state_false: [1]
          }
       });
       g = D;
       f = createSprite(F, "state_" + g, A.width / 2 / 2, A.height / 2, A.width / 2, A.height);
       f.x = t;
       f.y = B;
       f.stop();
       s_bMobile || (f.cursor = "pointer");
       p.addChild(f);
       this._initListener()
    };
    this.unload = function() {
       f.off("mousedown", k);
       f.off("pressup", u);
       p.removeChild(f)
    };
    this._initListener = function() {
       k = f.on("mousedown", this.buttonDown);
       u = f.on("pressup", this.buttonRelease)
    };
    this.addEventListener = function(t, B, A) {
       l[t] = B;
       h[t] = A
    };
    this.setCursorType = function(t) {
       f.cursor = t
    };
    this.setActive = function(t) {
       g = t;
       f.gotoAndStop("state_" + g)
    };
    this.buttonRelease = function() {
       f.scaleX = 1;
       f.scaleY = 1;
       playSound("press_but", 1, !1);
       g = !g;
       f.gotoAndStop("state_" + g);
       l[ON_MOUSE_UP] && l[ON_MOUSE_UP].call(h[ON_MOUSE_UP], g)
    };
    this.buttonDown = function() {
       f.scaleX = .9;
       f.scaleY = .9;
       l[ON_MOUSE_DOWN] && l[ON_MOUSE_DOWN].call(h[ON_MOUSE_DOWN])
    };
    this.setPosition = function(t, B) {
       f.x = t;
       f.y = B
    };
    this._init(a, b, c, d, e)
 }
 
 function CBetBut(a, b, c, d) {
    var e, g, l, h = [],
       f, k;
    this._init = function(p, t, B) {
       e = !1;
       g = [];
       l = [];
       k = new createjs.Container;
       k.x = p;
       k.y = t;
       u.addChild(k);
       p = {
          images: [s_oSpriteLibrary.getSprite("bet_but")],
          frames: {
             width: 58,
             height: 72
          },
          animations: {
             bet_but1_on: 0,
             bet_but1_off: 1,
             bet_but2_on: 2,
             bet_but2_off: 3,
             bet_but3_on: 4,
             bet_but3_off: 5,
             bet_but4_on: 6,
             bet_but4_off: 7,
             bet_but5_on: 8,
             bet_but5_off: 9,
             bet_but6_on: 10,
             bet_but6_off: 11,
             bet_but7_on: 12,
             bet_but7_off: 13,
             bet_but8_on: 14,
             bet_but8_off: 15,
             bet_but9_on: 16,
             bet_but9_off: 17,
             bet_but10_on: 18,
             bet_but10_off: 19,
             bet_but11_on: 20,
             bet_but11_off: 21,
             bet_but12_on: 22,
             bet_but12_off: 23,
             bet_but13_on: 24,
             bet_but13_off: 25,
             bet_but14_on: 26,
             bet_but14_off: 27,
             bet_but15_on: 28,
             bet_but15_off: 29,
             bet_but16_on: 30,
             bet_but16_off: 31,
             bet_but17_on: 32,
             bet_but17_off: 33,
             bet_but18_on: 34,
             bet_but18_off: 35,
             bet_but19_on: 36,
             bet_but19_off: 37,
             bet_but20_on: 38,
             bet_but20_off: 39
          }
       };
       p = new createjs.SpriteSheet(p);
       f = createSprite(p, B + "_on", 0, 0, 59, 74);
       f.stop();
       f.cursor = "pointer";
       k.addChild(f);
       this._initListener()
    };
    this.unload = function() {
       f.off("mousedown", this.buttonDown);
       f.off("pressup", this.buttonRelease);
       u.removeChild(f)
    };
    this.disable = function(p) {
       e = p
    };
    this.setVisible = function(p) {
       f.visible = p
    };
    this.setOn = function() {
       f.gotoAndStop(c + "_on")
    };
    this.setOff = function() {
       f.gotoAndStop(c + "_off")
    };
    this._initListener = function() {
       f.on("mousedown", this.buttonDown);
       f.on("pressup", this.buttonRelease)
    };
    this.addEventListener = function(p, t, B) {
       g[p] = t;
       l[p] = B
    };
    this.addEventListenerWithParams = function(p, t, B, A) {
       g[p] = t;
       l[p] = B;
       h = A
    };
    this.buttonRelease = function() {
       g[ON_MOUSE_UP] && !1 === e && (playSound("press_but", 1, !1), g[ON_MOUSE_UP].call(l[
          ON_MOUSE_UP], h))
    };
    this.buttonDown = function() {
       g[ON_MOUSE_DOWN] && !1 === e && g[ON_MOUSE_DOWN].call(l[ON_MOUSE_DOWN], h)
    };
    this.setPosition = function(p, t) {
       f.x = p;
       f.y = t
    };
    this.setX = function(p) {
       f.x = p
    };
    this.setY = function(p) {
       f.y = p
    };
    this.getButtonImage = function() {
       return f
    };
    this.getX = function() {
       return f.x
    };
    this.getY = function() {
       return f.y
    };
    var u = d;
    this._init(a, b, c)
 }
 
 function CGame() {
    var a, b = !1,
       c = !1,
       d, e, g, l, h, f, k, u, p, t, B, A, D, F, N, m, J, I, E, w, z, C, R, S, y, x, n, L, ea, O, W,
       fa, q, ha, ia, X, P, G, Q, aa, v, ba, U, V, M, Z, Y, ca;
    this._init = function() {
       l = GAME_STATE_IDLE;
       p = J = C = k = h = 0;
       ea = [0, 1, 2, 3, 4];
       f = ea[0];
       u = NUM_PAYLINES;
       D = TOTAL_MONEY;
       B = START_BET;
       B = parseFloat(B.toFixed(2));
       for (var r = 0; r < COIN_BET.length; r++)
          if (B === COIN_BET[r]) {
             S = r;
             break
          }
       A = B * u;
       d = !1;
       w = z = 0;
       R = [];
       s_oTweenController = new CTweenController;
       ia = new CBgController(s_oAttachSection);
       M = new createjs.Container;
       M.x = REEL_OFFSET_X;
       M.y = REEL_OFFSET_Y;
       M.scale = REEL_SCALE;
       s_oAttachSection.addChild(M);
       fa = createBitmap(s_oSpriteLibrary.getSprite("bg_cable"));
       s_oAttachSection.addChild(fa);
       q = createBitmap(s_oSpriteLibrary.getSprite("bg_cable_freespin"));
       q.alpha = 0;
       s_oAttachSection.addChild(q);
       this._initReels();
       W = s_oSpriteLibrary.getSprite("mask_slot");
       P = createBitmap(W);
       M.addChild(P);
       G = createBitmap(s_oSpriteLibrary.getSprite("mask_slot_freespins"));
       G.alpha = 0;
       M.addChild(G);
       ha = new CSuspanceEffect(M);
       M.regX = W.width / 2 + P.x;
       M.regY = W.height / 2 + P.y;
       r = {
          images: [s_oSpriteLibrary.getSprite("logo")],
          framerate: 40,
          frames: {
             width: 542,
             height: 224,
             regX: 271,
             regY: 0
          },
          animations: {
             normal: 0,
             freespin: [1, 23]
          }
       };
       a = W.width / 2;
       r = new createjs.SpriteSheet(r);
       X = createSprite(r, "normal", 271, 0, 542, 224);
       X.x = a;
       X.y = -70;
       M.addChild(X);
       v = new CInterface(B, A, M);
       this._initStaticSymbols();
       ca = new CAvatarController(s_oAttachSection);
       ca.show("idle");
       ba = new CPaytableLandscape;
       U = new CPaytablePortrait;
       V = new CBonusPanel;
       Q = new CFreespinPanel(s_oStage);
       aa = new CResultFreespin(s_oStage);
       this.refreshButtonPos();
       playSound("ambience_game", 1, !0);
       isSoundPlaying("soundtrack_menu") ? fadeStopSound("soundtrack_menu", s_aSounds.soundtrack_menu
          .volume(), 0, 3E3) : stopSound("soundtrack_menu");
       b = !0;
       D < A && new CRechargePanel
    };
    this.unload = function() {
       stopSound("ambience_game");
       stopSound("freespin_soundtrack");
       v.unload();
       ba.unload();
       U.unload();
       for (var r = 0; r < x.length; r++) x[r].unload();
       for (r = 0; r < NUM_ROWS; r++)
          for (var H = 0; H < NUM_REELS; H++) n[r][H].unload();
       s_oMsgBox.unload();
       s_oAttachSection.removeAllChildren();
       s_oGame = null
    };
    this.refreshButtonPos = function() {
       REEL_SCALE = 1;
       if (s_bLandscape) {
          M.y = REEL_OFFSET_Y;
          Y.y = REEL_OFFSET_Y;
          var r = CANVAS_HEIGHT - 2 * s_iOffsetY;
          r < W.height && (REEL_SCALE = r / W.height);
          ba.refreshButtonPos();
          g && !ba.isVisible() && (U.hide(), ba.show(U.getCurPage()));
          v.showButPaylines()
       } else M.y = REEL_OFFSET_Y - 100, Y.y = REEL_OFFSET_Y - 100, r = CANVAS_WIDTH - 2 *
          s_iOffsetX + 340, r < W.width ? (REEL_SCALE = r / W.width, v.hideButPaylines()) : v.showButPaylines(),
          U.refreshButtonPos(), g && !U.isVisible() && (ba.hide(), U.show(ba.getCurPage()));
       M.scale = REEL_SCALE;
       Y.scale = REEL_SCALE;
       r = M.y + W.height / 2 + 100;
       r > CANVAS_HEIGHT - s_iOffsetY && (r = CANVAS_HEIGHT - s_iOffsetY + 80);
       ca.refreshPos(r);
       v.refreshButtonPos();
       V.refreshButtonPos()
    };
    this._initReels = function() {
       Z = new createjs.Container;
       M.addChild(Z);
       var r = START_REEL_OFFSET_X = 223,
          H = START_REEL_OFFSET_Y = 105,
          K = new createjs.Shape;
       K.graphics.beginFill("rgba(255,0,0,0.01)").drawRect(r, H, SYMBOL_WIDTH * NUM_REELS +
          SPACE_BETWEEN_SYMBOLS * (NUM_REELS - 1), SYMBOL_HEIGHT * NUM_ROWS +
          SPACE_HEIGHT_BETWEEN_SYMBOLS * (NUM_ROWS - 1));
       M.addChild(K);
       this._generateLosingPattern();
       var T = 0;
       x = [];
       for (var da = 0; da < NUM_REELS; da++) x[da] = new CReelColumn(da, r, H, T, [O[0][da], O[1]
             [da], O[2][da]
          ], Z), x[da + NUM_REELS] = new CReelColumn(da + NUM_REELS, r, H + (SYMBOL_HEIGHT +
             SPACE_HEIGHT_BETWEEN_SYMBOLS) * NUM_ROWS, T, [O[0][da], O[1][da], O[2][da]], Z), r +=
          SYMBOL_WIDTH + SPACE_BETWEEN_SYMBOLS, T += REEL_DELAY;
       Z.mask = K
    };
    this._initStaticSymbols = function() {
       Y = new createjs.Container;
       Y.x = P.x + W.width / 2 + SYMBOL_WIDTH / 2 + 30;
       Y.y = REEL_OFFSET_Y;
       s_oAttachSection.addChild(Y);
       var r = 0,
          H = 0;
       n = [];
       for (var K = 0; K < NUM_ROWS; K++) {
          n[K] = [];
          for (var T = 0; T < NUM_REELS; T++) {
             var da = new CStaticSymbolCell(K, T, r, H, Y);
             n[K][T] = da;
             r += (SYMBOL_WIDTH + SPACE_BETWEEN_SYMBOLS) * REEL_SCALE
          }
          r = 0;
          H += (SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS) * REEL_SCALE
       }
       Y.regX = Y.getBounds().width / 2;
       Y.regY = Y.getBounds().height / 2;
       for (K = 0; K < NUM_ROWS; K++)
          for (T = 0; T < NUM_REELS; T++) n[K][T].setVisible(!1)
    };
    this._generateRandSymbols = function() {
       for (var r = [], H = 0; H < NUM_ROWS; H++) r[H] = s_aRandSymbols[Math.floor(Math.random() *
          s_aRandSymbols.length)];
       return r
    };
    this.reelArrived = function(r, H) {
       if (h > y)
          if (f === H) {
             if (!1 === x[r].isReadyToStop()) {
                var K = r;
                r < NUM_REELS ? (K += NUM_REELS, x[K].setReadyToStop(), x[r].restart([O[0][r], O[
                   1][r], O[2][r]], !0)) : (K -= NUM_REELS, x[K].setReadyToStop(), x[r].restart(
                   [O[0][K], O[1][K], O[2][K]], !0))
             }
          } else x[r].restart(this._generateRandSymbols(), !1);
       else x[r].restart(this._generateRandSymbols(), !1), !c || 0 !== r && r !== NUM_REELS - 1 ||
          h++
    };
    this.stopNextReel = function() {
       k++;
       if (0 === k % 2) {
          ha.hide();
          for (var r = 0; r < NUM_ROWS; r++) O[r][f] === BONUS_SYMBOL && F++, O[r][f] ===
             FREESPIN_SYMBOL && N++;
          f = ea[k / 2];
          k === 2 * NUM_REELS && this._endReelAnimation()
       }
       1 < f && (2 === F || 2 === N) ? (h = 0, y = SUSPANCE_REEL_LOOPS, ha.show(132 + f * (
             SYMBOL_WIDTH + SPACE_BETWEEN_SYMBOLS), START_REEL_OFFSET_Y - 35)) : y =
          MIN_REEL_LOOPS
    };
    this._realEndReelAnimation = function() {
       ha.hide(); - 1 !== R.indexOf(BONUS_GAME) || 0 < z ? (this.resetAutoSpin(), v.disableGuiButtons(
          d, 0 < z ? !0 : !1)) : d ? v.enableSpin(!0) : v.enableGuiButtons();
       v.setSpinState(TEXT_SPIN);
       "normal" !== X.currentAnimation && v.refreshFreeSpinNum(z);
       if (0 < L.length) {
          if ("normal" === X.currentAnimation) {
             var r = .5 < Math.random() ? 0 : 1;
             ca.show("win_" + r);
             playSound("avatar_win_" + r, 1, !1)
          }
          for (r = 0; r < L.length; r++) {
             7 > L[r].value && (ba.highlightCombo(L[r].value, L[r].num_win), U.highlightCombo(L[r]
                .value, L[r].num_win));
             0 < L[r].line && v.showLine(L[r].line);
             for (var H = L[r].list, K = 0; K < H.length; K++) n[H[K].row][H[K].col].showWinFrame()
          }
          0 < m && v.refreshWinText(m);
          TIME_SHOW_ALL_WINS = 2E3;
          p = 0;
          l = GAME_STATE_SHOW_ALL_WIN;
          v.refreshMoney(D)
       } else if (0 < z) v.disableSpin(0 < z ? !1 : !0), this.onSpin();
       else if ("freespin" === X.currentAnimation && (aa.show(J), X.gotoAndStop("normal"), ca.show(
                "end_freespin"), v.refreshFreeSpinNum(""), v.refreshFreeSpinAmount(0), createjs.Tween
             .get(q).to({
                alpha: 0
             }, 1500, createjs.Ease.cubicOut), createjs.Tween.get(G).to({
                alpha: 0
             }, 1500, createjs.Ease.cubicOut), ca.hideFreespin(), ia.stopFreespin(), setVolume(
                "ambience_game", 1), stopSound("freespin_soundtrack"), v.enableGuiButtons()), d)
          if (D < A && 0 === z) v.enableGuiButtons(), this.resetAutoSpin(), v.enableGuiButtons(),
             l = GAME_STATE_IDLE;
          else this.onSpin();
       else v.enableGuiButtons(), l = GAME_STATE_IDLE;
       D < A && 0 === z ? (v.enableGuiButtons(), this.resetAutoSpin()) : d || ("freespin" !== X.currentAnimation ?
          0 < z || -1 !== R.indexOf(BONUS_GAME) ? v.enableSpin(!1) : (v.enableGuiButtons(), v.disableBetBut(!
             1)) : 0 < L.length && (v.enableSpin(!1), v.disableBetBut(!0)));
       v.refreshFreeSpinAmount(J)
    };
    this.refreshMoney = function(r) {
       D = r;
       v.refreshMoney(D);
       saveItem(LOCALSTORAGE_STRING + "score", D)
    };
    this._endReelAnimation = function() {
       c = !1;
       t = k = h = 0;
       f = ea[0];
       this._realEndReelAnimation()
    };
    this.hidePayTable = function() {
       g = !1;
       s_bLandscape ? ba.hide() : U.hide()
    };
    this.showWin = function() {
       if (l === GAME_STATE_SHOW_WIN) {
          if (0 < t) {
             var r = L[t - 1].line;
             v.hideLine(r);
             var H = L[t - 1].list;
             for (r = 0; r < H.length; r++) x[H[r].col].setVisible(H[r].row, !0), x[H[r].col +
                NUM_REELS].setVisible(H[r].row, !0)
          }
          if (t === L.length)
             if (t = 0, "freespin" === X.currentAnimation && 0 === z && (aa.show(J), X.gotoAndStop(
                      "normal"), ca.show("end_freespin"), v.refreshFreeSpinNum(""), v.refreshFreeSpinAmount(
                      ""), createjs.Tween.get(q).to({
                      alpha: 0
                   }, 1500, createjs.Ease.cubicOut), createjs.Tween.get(G).to({
                      alpha: 0
                   }, 1500, createjs.Ease.cubicOut), ca.hideFreespin(), ia.stopFreespin(),
                   setVolume("ambience_game", 1), stopSound("freespin_soundtrack"), v.enableGuiButtons()
                ), -1 !== R.indexOf(BONUS_GAME)) this._hideAllWins(), $(s_oMain).trigger(
                "bonus_call", {
                   bet: COIN_BET[S]
                });
             else if (e) e = !1, Q.show(w);
          else if (0 < z) v.disableSpin(0 < z ? !1 : !0), this.onSpin();
          else if (d) this.onSpin();
          else v.enableGuiButtons(), v.disableBetBut(!1), l = GAME_STATE_IDLE, v.enableGuiButtons();
          else {
             r = L[t].line;
             H = L[t].list;
             if (0 === r) {
                var K = Math.floor(H.length / 2);
                r = H[K].row;
                K = H[K].col
             } else {
                v.showLine(r);
                K = 2;
                var T = !1;
                3 > H.length ? L[t].value === FREESPIN_SYMBOL ? (K = H[0].col, r = H[0].row, T = !
                   0) : (K = H.length - 1, r = H[K].row) : r = H[K].row;
                for (; !T && O[r][K] === WILD_SYMBOL;)
                   if (K--, 0 > K) {
                      K = 0;
                      r = H[K].row;
                      break
                   } else r = H[K].row
             }
             H = {
                x: 0,
                y: 0
             };
             0 === r ? 0 === K ? T = {
                x: 0,
                y: 0
             } : 4 === K ? (T = {
                x: WIN_BIG_ANIM_WIDTH,
                y: 0
             }, H = {
                x: SYMBOL_WIDTH,
                y: 0
             }) : (T = {
                x: WIN_BIG_ANIM_WIDTH / 2,
                y: 0
             }, H = {
                x: SYMBOL_WIDTH / 2,
                y: 0
             }) : 1 === r ? 0 === K ? (T = {
                x: 0,
                y: WIN_BIG_ANIM_HEIGHT / 2
             }, H = {
                x: 0,
                y: SYMBOL_HEIGHT / 2
             }) : 4 === K ? (T = {
                x: WIN_BIG_ANIM_WIDTH,
                y: WIN_BIG_ANIM_HEIGHT / 2
             }, H = {
                x: SYMBOL_WIDTH,
                y: SYMBOL_HEIGHT / 2
             }) : (T = {
                x: WIN_BIG_ANIM_WIDTH / 2,
                y: WIN_BIG_ANIM_HEIGHT / 2
             }, H = {
                x: SYMBOL_WIDTH / 2,
                y: SYMBOL_HEIGHT / 2
             }) : 0 === K ? (T = {
                x: 0,
                y: WIN_BIG_ANIM_HEIGHT
             }, H = {
                x: 0,
                y: SYMBOL_HEIGHT
             }) : 4 === K ? (T = {
                x: WIN_BIG_ANIM_WIDTH,
                y: WIN_BIG_ANIM_HEIGHT
             }, H = {
                x: SYMBOL_WIDTH,
                y: SYMBOL_HEIGHT
             }) : (T = {
                x: WIN_BIG_ANIM_WIDTH / 2,
                y: WIN_BIG_ANIM_HEIGHT
             }, H = {
                x: SYMBOL_WIDTH / 2,
                y: SYMBOL_HEIGHT
             });
             n[r][K].show(O[r][K] + 1, L[t].amount, H, T, 1);
             t++
          }
       }
    };
    this._hideAllWins = function() {
       for (var r = 0; r < NUM_ROWS; r++)
          for (var H = 0; H < NUM_REELS; H++) n[r][H].hideWinFrame();
       v.hideAllLines()
    };
    this._prepareForWinsShowing = function() {
       p = TIME_SHOW_WIN;
       l = GAME_STATE_SHOW_WIN;
       this.showWin()
    };
    this.activateLines = function(r) {
       u = r;
       this.removeWinShowing();
       A = r = B * u;
       v.refreshTotalBet(A);
       v.refreshNumLines(u);
       r > D ? v.disableSpin(0 < z ? !1 : !0) : v.enableSpin(0 < z ? !1 : !0)
    };
    this.addLine = function() {
       u === NUM_PAYLINES ? u = 1 : u++;
       A = B * u;
       v.refreshTotalBet(A);
       v.refreshNumLines(u);
       v.enableSpin(0 < z ? !1 : !0)
    };
    this.resetCoinBet = function() {
       S = 0;
       var r = COIN_BET[S],
          H = r * u;
       B = r;
       A = H;
       v.refreshBet(B);
       v.refreshTotalBet(A);
       v.enableSpin(0 < z ? !1 : !0)
    };
    this.changeCoinBet = function() {
       S++;
       S === COIN_BET.length && (S = 0);
       var r = parseFloat(COIN_BET[S]),
          H = r * u;
       B = r;
       B = Math.floor(100 * B) / 100;
       A = H;
       v.refreshBet(B);
       v.refreshTotalBet(A);
       v.enableSpin(0 < z ? !1 : !0)
    };
    this.removeWinShowing = function() {
       ba.resetHighlightCombo();
       U.resetHighlightCombo();
       v.resetWin();
       for (var r = 0; r < NUM_ROWS; r++)
          for (var H = 0; H < NUM_REELS; H++) n[r][H].hide(), x[H].setVisible(r, !0), x[H +
             NUM_REELS].setVisible(r, !0);
       for (r = 0; r < x.length; r++) x[r].activate();
       l = GAME_STATE_IDLE
    };
    this.forceStopReel = function() {
       0 === z && this.resetAutoSpin();
       l = GAME_STATE_IDLE;
       for (var r = 0; r < NUM_REELS; r++) {
          var H = REEL_OFFSET_Y + (SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS) * NUM_ROWS;
          x[r].forceStop([O[0][r], O[1][r], O[2][r]], START_REEL_OFFSET_Y - 27);
          x[r + NUM_REELS].forceStop(null, H)
       }
       this._endReelAnimation()
    };
    this.onSpin = function() {
       y = MIN_REEL_LOOPS;
       N = F = 0;
       !(0 < z && "freespin" !== X.currentAnimation || -1 !== R.indexOf(BONUS_GAME) || 0 === z &&
          "freespin" === X.currentAnimation) || l !== GAME_STATE_SHOW_ALL_WIN && l !==
          GAME_STATE_SHOW_WIN ? -1 === R.indexOf(BONUS_FREESPIN) || l !== GAME_STATE_SHOW_ALL_WIN &&
          l !== GAME_STATE_SHOW_WIN ? D < A && 0 === z ? (this.resetAutoSpin(), new CRechargePanel) :
          (c = !1, playSound("spin_but", 1, !1), v.disableBetBut(!0), this.removeWinShowing(), A =
             "freespin" === X.currentAnimation ? 0 : B * u, R = [], this._hideAllWins(), v.disableGuiButtons(
                d, 0 < z ? !0 : !1), D -= A, v.refreshMoney(D), $(s_oMain).trigger("bet_placed", {
                bet: COIN_BET[S],
                tot_bet: A,
                payline: u
             }), l = GAME_STATE_SPINNING) : (this._hideAllWins(), v.disableSpin(!0), this.removeWinShowing(),
             e = !1, Q.show(w)) : (this._hideAllWins(), this.removeWinShowing(), t = L.length, l =
             GAME_STATE_SHOW_WIN, this.showWin())
    };
    this.onSpinReceived = function(r) {
       C++;
       C === NUM_SPIN_FOR_ADS && (C = 0, $(s_oMain).trigger("show_interlevel_ad"));
       if (!0 === r.res) {
          O = r.pattern;
          L = r.win_lines;
          var H = parseFloat(r.tot_win),
             K = r.bonus;
          w = parseInt(r.num_freespin);
          D = parseFloat(r.money);
          "normal" !== X.currentAnimation && !1 === e && (J += H);
          z = w;
          0 < H || !0 === K || 0 < z ? (e = !1, r.freespin && (R.push(BONUS_FREESPIN), e = !0, J =
             0), K && R.push(BONUS_GAME), m = H) : L = [];
          c = !0;
          $(s_oMain).trigger("save_score", D);
          saveItem(LOCALSTORAGE_STRING + "score", D)
       } else s_oGame._generateLosingPattern()
    };
    this.onBonusStart = function(r) {
       trace(r);
       D = parseFloat(r.money);
       parseFloat(r.bonus_win);
       V.show(JSON.parse(r.prize_list), B);
       l = GAME_STATE_BONUS;
       $(s_oMain).trigger("save_score", D);
       saveItem(LOCALSTORAGE_STRING + "score", D)
    };
    this.onAutoSpin = function(r) {
       if ((d = r) && l === GAME_STATE_IDLE) this.onSpin()
    };
    this.onStopAutoSpin = function() {
       this.resetAutoSpin();
       l !== GAME_STATE_SPINNING && l !== GAME_STATE_BONUS && v.enableGuiButtons()
    };
    this.resetAutoSpin = function() {
       d = !1;
       v.setAutoSpinState(TEXT_AUTO_SPIN)
    };
    this._generateLosingPattern = function() {
       for (var r = [], H = 0; H < NUM_ROWS; H++) {
          var K = Math.floor(Math.random() * (s_aRandSymbols.length - 2));
          K = s_aRandSymbols[K];
          r[H] = K
       }
       O = [];
       for (H = 0; H < NUM_ROWS; H++) {
          O[H] = [];
          for (var T = 0; T < NUM_REELS; T++)
             if (0 === T) O[H][T] = r[H];
             else {
                do K = Math.floor(Math.random() * (s_aRandSymbols.length - 2)), K =
                   s_aRandSymbols[K]; while (r[0] === K || r[1] === K || r[2] === K);
                O[H][T] = K
             }
       }
       L = [];
       c = !0
    };
    this.onInfoClicked = function() {
       l !== GAME_STATE_SPINNING && (g = !0, s_bLandscape ? ba.isVisible() ? ba.hide() : ba.show(
          0) : U.isVisible() ? U.hide() : U.show(0))
    };
    this.exitFromFreespinPanel = function() {
       setVolume("ambience_game", 0);
       playSound("freespin_soundtrack", 1, !0);
       v.refreshFreeSpinNum(z);
       v.refreshFreeSpinAmount(0);
       X.gotoAndPlay("freespin");
       ca.show("start_freespin");
       ia.startFreespin();
       createjs.Tween.get(q).to({
          alpha: 1
       }, 1500, createjs.Ease.cubicOut);
       createjs.Tween.get(G).to({
          alpha: 1
       }, 1500, createjs.Ease.cubicOut);
       ca.startFreespin();
       I = 0;
       E = Math.floor(Math.random() * (MAX_TIME_EFFECT_FREESPIN - MIN_TIME_EFFECT_FREESPIN + 1)) +
          MIN_TIME_EFFECT_FREESPIN;
       v.disableSpin(0 < z ? !1 : !0);
       l = GAME_STATE_IDLE;
       this.onSpin()
    };
    this.exitFromBonus = function(r) {
       v.refreshMoney(D);
       v.refreshWinText(r);
       if (e) e = !1, Q.show(w);
       else if (d) this.onSpin();
       else v.enableGuiButtons(), v.disableBetBut(!1), v.enableSpin(0 < z ? !1 : !0), v.enableGuiButtons();
       l = GAME_STATE_IDLE
    };
    this.onExit = function() {
      window.location = 'userpage.html';
      return;
       $(s_oMain).trigger("start_session");
       this.unload();
       s_oMain.gotoMenu()
    };
    this.getState = function() {
       return l
    };
    this.update = function() {
       if (!1 !== b) {
          switch (l) {
             case GAME_STATE_SPINNING:
                for (var r = 0; r < x.length; r++) x[r].update();
                break;
             case GAME_STATE_SHOW_ALL_WIN:
                p += s_iTimeElaps, p > TIME_SHOW_ALL_WINS && (p = 0, this._hideAllWins(), t = d ?
                   L.length : 0, this._prepareForWinsShowing())
          }
          "freespin" === X.currentAnimation && (I += s_iTimeElaps, I > E && (E = Math.floor(Math.random() *
                (MAX_TIME_EFFECT_FREESPIN - MIN_TIME_EFFECT_FREESPIN + 1)) +
             MIN_TIME_EFFECT_FREESPIN, I = 0))
       }
    };
    s_oGame = this;
    this._init()
 }
 var s_oGame = null,
    s_oTweenController;
 
 function CReelColumn(a, b, c, d, e, g) {
    var l, h, f, k, u, p, t, B, A, D, F, N, m, J, I, E;
    this._init = function(w, z, C, R, S) {
       k = f = h = l = !1;
       B = 0;
       u = w;
       t = R;
       p = u < NUM_REELS ? u : u - NUM_REELS;
       D = 0;
       F = MAX_FRAMES_REEL_EASE;
       A = REEL_STATE_START;
       N = C;
       m = N + (SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS) * NUM_ROWS - OFFSET_Y_SYMBOLS;
       this.initContainer(z, C, S)
    };
    this.initContainer = function(w, z, C) {
       E = new createjs.Container;
       E.x = w;
       E.y = z;
       w = -OFFSET_Y_SYMBOLS;
       J = [];
       I = [];
       for (z = 0; z < NUM_ROWS; z++) {
          var R = createSprite(s_aSymbolData[C[z]], "static", 0, 0, SYMBOL_WIDTH, SYMBOL_HEIGHT);
          R.stop();
          R.x = 0;
          R.y = w;
          E.addChild(R);
          J[z] = R;
          I[z] = C[z];
          w += SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS
       }
       g.addChild(E)
    };
    this.unload = function() {
       g.removeChild(E)
    };
    this.activate = function() {
       N = E.y;
       m = N + (SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS) * NUM_ROWS;
       l = !0
    };
    this._setSymbol = function(w) {
       for (var z = 0, C = 0; C < w.length; C++) J[C].spriteSheet = s_aSymbolData[w[C]], J[C].gotoAndStop(
             "static"), J[C].x = 0, J[C].y = z, I[C] = w[C], z += SYMBOL_HEIGHT +
          SPACE_HEIGHT_BETWEEN_SYMBOLS
    };
    this.forceStop = function(w, z) {
       null !== w && this._setSymbol(w);
       E.y = z;
       l = !1;
       D = 0;
       F = MAX_FRAMES_REEL_EASE;
       A = REEL_STATE_START;
       B = 0;
       f = h = !1
    };
    this.setVisible = function(w, z) {
       J[w].visible = z
    };
    this.restart = function(w, z) {
       E.y = N = REEL_START_Y;
       m = N + (SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS) * NUM_ROWS;
       this._setSymbol(w);
       if (h = z) {
          D = 0;
          F = MAX_FRAMES_REEL_EASE;
          A = REEL_STATE_STOP;
          for (var C = 0; C < NUM_ROWS; C++) J[C].gotoAndStop("static");
          f = !0
       } else
          for (C = 0; C < NUM_ROWS; C++) J[C].gotoAndStop("moving")
    };
    this.setReadyToStop = function() {
       D = 0;
       F = MAX_FRAMES_REEL_EASE;
       A = REEL_STATE_STOP
    };
    this.isReadyToStop = function() {
       return h
    };
    this.getPosUpLeft = function(w) {
       return {
          x: E.x,
          y: E.y + (SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS) * w
       }
    };
    this.getY = function() {
       return E.y
    };
    this._updateStart = function() {
       D++;
       D > F && (D = 0, F /= 2, A++, N = E.y, m = N + (SYMBOL_HEIGHT +
          SPACE_HEIGHT_BETWEEN_SYMBOLS) * NUM_ROWS - OFFSET_Y_SYMBOLS);
       var w = s_oTweenController.easeInBack(D, 0, 1, F);
       w = s_oTweenController.tweenValue(N, m, w);
       E.y = w
    };
    this._updateMoving = function() {
       D++;
       D > F && (D = 0, N = E.y, m = N + (SYMBOL_HEIGHT + SPACE_HEIGHT_BETWEEN_SYMBOLS) *
          NUM_ROWS - OFFSET_Y_SYMBOLS);
       var w = s_oTweenController.easeLinear(D, 0, 1, F);
       w = s_oTweenController.tweenValue(N, m, w);
       E.y = w
    };
    this._updateStopping = function() {
       D++;
       if (D >= F) l = !1, D = 0, F = MAX_FRAMES_REEL_EASE, A = REEL_STATE_START, B = 0, k = h = !
          1, f && (f = !1, E.y = m), s_oGame.stopNextReel();
       else {
          var w = s_oTweenController.easeOutBack(D, 0, 1, F);
          w = s_oTweenController.tweenValue(N, m, w);
          E.y = w;
          !1 === k && D >= .7 * F && f && (k = !0, I[0] === BONUS_SYMBOL || I[1] === BONUS_SYMBOL ||
             I[2] === BONUS_SYMBOL ? playSound("reel_stop_bonus", 1, !1) : I[0] ===
             FREESPIN_SYMBOL || I[1] === FREESPIN_SYMBOL || I[2] === FREESPIN_SYMBOL ?
             playSound("reel_stop_freespin", 1, !1) : playSound("reel_stop", 1, !1))
       }
    };
    this.update = function() {
       if (!1 !== l && (B++, B > t)) switch (!1 === h && E.y > REEL_ARRIVAL_Y && A !==
          REEL_STATE_STOP && s_oGame.reelArrived(u, p), A) {
          case REEL_STATE_START:
             this._updateStart();
             break;
          case REEL_STATE_MOVING:
             this._updateMoving();
             break;
          case REEL_STATE_STOP:
             this._updateStopping()
       }
    };
    this._init(a, b, c, d, e)
 }
 
 function CInterface(a, b, c) {
    var d, e, g, l, h, f, k, u, p, t, B, A, D, F, N, m, J, I, E, w, z, C, R = null,
       S = null;
    this._init = function(y, x, n) {
       this._initPaylines(n);
       w = new CGuiPortrait(y, s_oAttachSection);
       z = new CGuiLandscape(y, n);
       D = new CTLText(n, 250, 810, 278, 26, 26, "left", "#dab977", FONT_GAME_1, 1, 0, 0,
          TEXT_MONEY + ": " + formatEntries(TOTAL_MONEY) + TEXT_CURRENCY, !0, !0, !1, !1);
       F = new CTLText(n, 870, 810, 278, 26, 26, "left", "#dab977", FONT_GAME_1, 1, 0, 0,
          TEXT_BET + ": " + formatEntries(x) + TEXT_CURRENCY, !0, !0, !1, !1);
       N = new CTLText(n, 1180, 810, 278, 26, 26, "left", "#dab977", FONT_GAME_1, 1, 0, 0,
          TEXT_WIN + ": 0.00" + TEXT_CURRENCY, !0, !0, !1, !1);
       x = s_oSpriteLibrary.getSprite("amount_freespins");
       B = new createjs.Container;
       B.visible = !1;
       B.x = 466;
       B.y = 50;
       B.regX = x.width / 2;
       B.regY = x.height / 2;
       n.addChild(B);
       y = createBitmap(x);
       B.addChild(y);
       m = new CTLText(B, 40, x.height / 2, x.width - 80, x.height / 2 - 34, 48, "center",
          "#dab977", FONT_GAME_1, 1, 0, 0, "0", !0, !0, !1, !1);
       x = s_oSpriteLibrary.getSprite("amount_freespin_win");
       A = new createjs.Container;
       A.visible = !1;
       A.x = 1235;
       A.y = 50;
       A.regX = x.width / 2;
       A.regY = x.height / 2;
       n.addChild(A);
       y = createBitmap(x);
       A.addChild(y);
       J = new CTLText(A, 40, x.height / 2, x.width - 80, x.height / 2 - 34, 48, "center",
          "#dab977", FONT_GAME_1, 1, 0, 0, "0", !0, !0, !1, !1);
       n = s_oSpriteLibrary.getSprite("but_exit");
       d = CANVAS_WIDTH - n.width / 2 - 4;
       e = n.height / 2 + 4;
       t = new CGfxButton(d, e, n, s_oAttachSection);
       t.addEventListener(ON_MOUSE_UP, this._onExit, this);
       if (!1 === DISABLE_SOUND_MOBILE || !1 === s_bMobile) {
          var L = s_oSpriteLibrary.getSprite("audio_icon");
          h = L.width / 4 + 4;
          f = e;
          I = new CToggle(h, f, L, s_bAudioActive, s_oAttachSection);
          I.addEventListener(ON_MOUSE_UP, this._onAudioToggle, this);
          g = h + L.width / 2 + 4;
          l = f
       } else g = L.width / 2 + 4, l = e;
       L = window.document;
       n = L.documentElement;
       R = n.requestFullscreen || n.mozRequestFullScreen || n.webkitRequestFullScreen || n.msRequestFullscreen;
       S = L.exitFullscreen || L.mozCancelFullScreen || L.webkitExitFullscreen || L.msExitFullscreen;
       !1 === ENABLE_FULLSCREEN && (R = !1);
       R && screenfull.isEnabled && (L = s_oSpriteLibrary.getSprite("but_fullscreen"), E = new CToggle(
          g, l, L, s_bFullscreen, s_oAttachSection), E.addEventListener(ON_MOUSE_UP, this._onFullscreenRelease,
          this));
       C = new CAreYouSurePanel;
       C.addEventListener(ON_BUT_YES_DOWN, this._onExitYes, this);
       s_bMobile || (document.onkeyup = this.onKeyUp);
       this.refreshButtonPos()
    };
    this.onKeyUp = function(y) {
       y || (y = window.event);
       13 === y.keyCode && s_oInterface._onSpin();
       y.preventDefault();
       return !1
    };
    this.refreshButtonPos = function() {
       s_bLandscape ? (z.setVisible(!0), w.setVisible(!1)) : (z.setVisible(!1), w.setVisible(!0));
       w.refreshPos();
       !1 !== DISABLE_SOUND_MOBILE && !1 !== s_bMobile || I.setPosition(h + s_iOffsetX,
          s_iOffsetY + f);
       R && screenfull.isEnabled && E.setPosition(g + s_iOffsetX, l + s_iOffsetY);
       t.setPosition(d - s_iOffsetX, e + s_iOffsetY)
    };
    this.unload = function() {
       w.unload();
       z.unload();
       t.unload();
       C.unload();
       if (!1 === DISABLE_SOUND_MOBILE || !1 === s_bMobile) I.unload(), I = null;
       R && screenfull.isEnabled && E.unload();
       for (var y = 0; y < NUM_PAYLINES; y++) u[y].unload();
       s_oInterface = null
    };
    this.hideButPaylines = function() {
       for (var y = 0; y < u.length; y++) u[y].setVisible(!1)
    };
    this.showButPaylines = function() {
       for (var y = 0; y < u.length; y++) u[y].setVisible(!0)
    };
    this._initPaylines = function(y) {
       var x = [{
          x: 205,
          y: 475
       }, {
          x: 205,
          y: 205
       }, {
          x: 205,
          y: 683
       }, {
          x: 205,
          y: 131
       }, {
          x: 205,
          y: 192
       }, {
          x: 205,
          y: 122
       }, {
          x: 205,
          y: 467
       }, {
          x: 205,
          y: 213
       }, {
          x: 205,
          y: 127
       }, {
          x: 205,
          y: 239
       }, {
          x: 205,
          y: 227
       }, {
          x: 205,
          y: 199
       }, {
          x: 205,
          y: 439
       }, {
          x: 205,
          y: 131
       }, {
          x: 205,
          y: 443
       }, {
          x: 205,
          y: 243
       }, {
          x: 205,
          y: 500
       }, {
          x: 205,
          y: 162
       }, {
          x: 205,
          y: 140
       }, {
          x: 205,
          y: 265
       }];
       p = [];
       for (var n = 0; n < NUM_PAYLINES; n++) {
          var L = new createBitmap(s_oSpriteLibrary.getSprite("payline_" + (n + 1)));
          L.x = x[n].x;
          L.y = x[n].y;
          L.visible = !1;
          y.addChild(L);
          p[n] = L
       }
       u = [];
       x = 95;
       n = new CBetBut(160, x, "bet_but4", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 4);
       u[3] = n;
       x += 69;
       n = new CBetBut(160, x, "bet_but2", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 2);
       u[1] = n;
       x += 69;
       n = new CBetBut(160, x, "bet_but20", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 20);
       u[19] = n;
       x += 69;
       n = new CBetBut(160, x, "bet_but16", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 16);
       u[15] = n;
       x += 69;
       n = new CBetBut(160, x, "bet_but10", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 10);
       u[9] = n;
       x += 69;
       n = new CBetBut(160, x, "bet_but1", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 1);
       u[0] = n;
       x += 70;
       n = new CBetBut(160, x, "bet_but11", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 11);
       u[10] = n;
       x += 69;
       n = new CBetBut(160, x, "bet_but17", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 17);
       u[16] = n;
       x += 69;
       n = new CBetBut(160, x, "bet_but3", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 3);
       u[2] = n;
       n = new CBetBut(160, x + 69, "bet_but5", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 5);
       u[4] = n;
       x = 100;
       n = new CBetBut(1490, x, "bet_but14", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 14);
       u[13] = n;
       x += 69;
       n = new CBetBut(1490, x, "bet_but12", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 12);
       u[11] = n;
       x += 69;
       n = new CBetBut(1490, x, "bet_but9", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 9);
       u[8] = n;
       x += 69;
       n = new CBetBut(1490, x, "bet_but18", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 18);
       u[17] = n;
       x += 69;
       n = new CBetBut(1490, x, "bet_but6", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 6);
       u[5] = n;
       x += 70;
       n = new CBetBut(1490, x, "bet_but7", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 7);
       u[6] = n;
       x += 69;
       n = new CBetBut(1490, x, "bet_but19", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 19);
       u[18] = n;
       x += 69;
       n = new CBetBut(1490, x, "bet_but8", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 8);
       u[7] = n;
       x += 69;
       n = new CBetBut(1490, x, "bet_but13", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 13);
       u[12] = n;
       n = new CBetBut(1490, x + 69, "bet_but15", y);
       n.addEventListenerWithParams(ON_MOUSE_UP, this._onBetLineClicked, this, 15);
       u[14] = n
    };
    this.refreshMoney = function(y) {
       D.refreshText(TEXT_MONEY + ": " + formatEntries(y) + TEXT_CURRENCY)
    };
    this.refreshBet = function(y) {
       w.setBetText(TEXT_COIN + " " + formatEntries(y));
       z.setBetText(TEXT_COIN + " " + formatEntries(y))
    };
    this.refreshTotalBet = function(y) {
       F.refreshText(TEXT_BET + ": " + formatEntries(y) + TEXT_CURRENCY)
    };
    this.refreshNumLines = function(y) {
       k = !0;
       w.setLineText(TEXT_LINES + " " + y);
       z.setLineText(TEXT_LINES + " " + y);
       for (var x = 0; x < NUM_PAYLINES; x++) x < y ? (u[x].setOn(), p[x].visible = !0) : u[x].setOff();
       setTimeout(function() {
          for (var n = 0; n < NUM_PAYLINES; n++) p[n].visible = !1;
          k = !1
       }, 1E3)
    };
    this.resetWin = function() {
       N.refreshText(TEXT_WIN + ": " + formatEntries(0))
    };
    this.refreshWinText = function(y) {
       N.refreshText(TEXT_WIN + ": " + formatEntries(y))
    };
    this.refreshFreeSpinNum = function(y) {
       m.refreshText(y);
       "" === y ? (B.visible = !1, A.visible = !1) : (B.visible = !0, A.visible = !0)
    };
    this.refreshFreeSpinAmount = function(y) {
       "" === y ? J.refreshText(y) : J.refreshText(formatEntries(y))
    };
    this.showLine = function(y) {
       0 < y && (p[y - 1].visible = !0)
    };
    this.hideLine = function(y) {
       0 < y && (p[y - 1].visible = !1)
    };
    this.hideAllLines = function() {
       for (var y = 0; y < NUM_PAYLINES; y++) p[y].visible = !1
    };
    this.disableBetBut = function(y) {
       for (var x = 0; x < NUM_PAYLINES; x++) u[x].disable(y)
    };
    this.enableGuiButtons = function() {
       w.enableGuiButtons();
       z.enableGuiButtons()
    };
    this.enableSpin = function(y) {
       w.enableSpin(y);
       z.enableSpin(y)
    };
    this.disableSpin = function(y) {
       w.disableSpin(y);
       z.disableSpin(y)
    };
    this.disableGuiButtons = function(y, x) {
       w.disableGuiButtons(y, x);
       z.disableGuiButtons(y, x)
    };
    this.setAutoSpinState = function(y) {
       w.setAutoSpinState(y);
       z.setAutoSpinState(y)
    };
    this.setSpinState = function(y) {
       w.setSpinState(y);
       z.setSpinState(y)
    };
    this._onBetLineClicked = function(y) {
       k || (this.refreshNumLines(y), s_oGame.activateLines(y))
    };
    this._onSpin = function(y) {
       if (y === TEXT_SKIP) s_oGame.forceStopReel(), w.setSpinText(TEXT_SPIN), z.setSpinText(
          TEXT_SPIN);
       else s_oGame.onSpin()
    };
    this._onAddLine = function() {
       s_oGame.addLine()
    };
    this._onInfo = function() {
       s_oGame.onInfoClicked()
    };
    this._onBet = function() {
       s_oGame.changeCoinBet()
    };
    this._onAutoSpin = function(y) {
       y === TEXT_STOP_AUTO ? (z.setAutoSpinText(TEXT_AUTO_SPIN), w.setAutoSpinText(
          TEXT_AUTO_SPIN), s_oGame.onAutoSpin(!1)) : (z.setAutoSpinText(TEXT_STOP_AUTO), w.setAutoSpinText(
          TEXT_STOP_AUTO), s_oGame.onAutoSpin(!0))
    };
    this.resetFullscreenBut = function() {
       R && screenfull.isEnabled && E.setActive(s_bFullscreen)
    };
    this._onFullscreenRelease = function() {
       s_bFullscreen ? S.call(window.document) : R.call(window.document.documentElement);
       sizeHandler()
    };
    this._onAudioToggle = function() {
       Howler.mute(s_bAudioActive);
       s_bAudioActive = !s_bAudioActive
    };
    this._onExit = function() {
       C.show(TEXT_ARE_SURE)
    };
    this._onExitYes = function() {
       s_oGame.onExit()
    };
    s_oInterface = this;
    this._init(a, b, c)
 }
 var s_oInterface = null;
 
 function CPaytablePanelBase() {
    this._iCurPage;
    this._aNumSymbolComboText;
    this._aWinComboText;
    this._aPages;
    this._pStartPosExit;
    this._oCurPage;
    this._oButExit;
    this._oButArrowNext;
    this._oButArrowPrev;
    this._oContainer
 }
 CPaytablePanelBase.prototype._init = function() {
    this._iCurPage = 0;
    this._aPages = [];
    this._oContainer = new createjs.Container;
    this._oContainer.on("click", function() {});
    this._oContainer.visible = !1;
    s_oAttachSection.addChild(this._oContainer);
    var a = createBitmap(s_oSpriteLibrary.getSprite("bg_game"));
    this._oContainer.addChild(a);
    a = createBitmap(s_oSpriteLibrary.getSprite("bg_ship_0"));
    this._oContainer.addChild(a);
    a = createBitmap(s_oSpriteLibrary.getSprite("bg_ship_1"));
    a.y = 750;
    this._oContainer.addChild(a)
 };
 CPaytablePanelBase.prototype.attachButs = function(a, b) {
    this._oButArrowNext = new CGfxButton(b.x, b.y, s_oSpriteLibrary.getSprite("but_arrow_next"),
       this._oContainer);
    this._oButArrowNext.addEventListener(ON_MOUSE_UP, this._onNext, this);
    this._oButArrowPrev = new CGfxButton(a.x, a.y, s_oSpriteLibrary.getSprite("but_arrow_prev"),
       this._oContainer);
    this._oButArrowPrev.addEventListener(ON_MOUSE_UP, this._onPrev, this);
    var c = s_oSpriteLibrary.getSprite("but_exit");
    this._pStartPosExit = {
       x: CANVAS_WIDTH - c.width / 2 - 10,
       y: c.height / 2 + 10
    };
    this._oButExit = new CGfxButton(this._pStartPosExit.x, this._pStartPosExit.y, c, this._oContainer);
    this._oButExit.addEventListener(ON_MOUSE_UP, this._onExit, this)
 };
 CPaytablePanelBase.prototype.unload = function() {};
 CPaytablePanelBase.prototype._onNext = function() {
    this._iCurPage === this._aPages.length - 1 ? this._iCurPage = 0 : this._iCurPage++;
    console.log("BASE " + this._iCurPage);
    this._oCurPage.visible = !1;
    this._aPages[this._iCurPage].visible = !0;
    this._oCurPage = this._aPages[this._iCurPage]
 };
 CPaytablePanelBase.prototype._onPrev = function() {
    0 === this._iCurPage ? this._iCurPage = this._aPages.length - 1 : this._iCurPage--;
    this._oCurPage.visible = !1;
    this._aPages[this._iCurPage].visible = !0;
    this._oCurPage = this._aPages[this._iCurPage]
 };
 CPaytablePanelBase.prototype.refreshButtonPos = function() {
    this._oButExit.setPosition(this._pStartPosExit.x - s_iOffsetX, this._pStartPosExit.y +
       s_iOffsetY)
 };
 CPaytablePanelBase.prototype.show = function(a) {
    this._iCurPage = a;
    this._oCurPage.visible = !1;
    this._aPages[this._iCurPage].visible = !0;
    this._oCurPage = this._aPages[this._iCurPage];
    this._oContainer.visible = !0
 };
 CPaytablePanelBase.prototype.hide = function() {
    this._oContainer.visible = !1
 };
 CPaytablePanelBase.prototype.resetHighlightCombo = function() {
    for (var a = 0; a < this._aNumSymbolComboText.length; a++)
       if (void 0 !== this._aNumSymbolComboText[a])
          for (var b = 0; b < this._aNumSymbolComboText[a].length; b++) this._aNumSymbolComboText[
                a][b].color = "#ffffff", this._aWinComboText[a][b].color = "#ffff00", createjs.Tween
             .removeTweens(this._aWinComboText[a][b]), this._aWinComboText[a][b].alpha = 1
 };
 CPaytablePanelBase.prototype.highlightCombo = function(a, b) {
    this._aWinComboText[a][NUM_REELS - b].color = "#ff9000";
    this.tweenAlpha(this._aWinComboText[a][NUM_REELS - b], 0)
 };
 CPaytablePanelBase.prototype.tweenAlpha = function(a, b) {
    createjs.Tween.get(a, {
       loop: -1
    }).to({
       alpha: 0
    }, 200).to({
       alpha: 1
    }, 200)
 };
 CPaytablePanelBase.prototype._onExit = function() {
    s_oGame.hidePayTable()
 };
 CPaytablePanelBase.prototype.isVisible = function() {
    return this._oContainer.visible
 };
 CPaytablePanelBase.prototype.getCurPage = function() {
    return this._iCurPage
 };
 
 function CPaytableLandscape(a) {
    CPaytablePanelBase.call(this, a);
    this._init();
    this.attachButs({
       x: 230,
       y: CANVAS_HEIGHT / 2
    }, {
       x: CANVAS_WIDTH - 230,
       y: CANVAS_HEIGHT / 2
    })
 }
 CPaytableLandscape.prototype = Object.create(CPaytablePanelBase.prototype);
 CPaytableLandscape.prototype._init = function() {
    CPaytablePanelBase.prototype._init.call(this);
    var a = new createjs.Container;
    this._oContainer.addChild(a);
    var b = s_oSpriteLibrary.getSprite("paytable1_landscape"),
       c = createBitmap(b);
    c.x = CANVAS_WIDTH / 2;
    c.y = CANVAS_HEIGHT / 2;
    c.regX = b.width / 2;
    c.regY = b.height / 2;
    a.addChild(c);
    new CTLText(a, CANVAS_WIDTH / 2 - 300, CANVAS_HEIGHT / 2 - b.height / 2 + 104, 600, 46, 46,
       "center", "#fff", FONT_GAME_1, 1, 0, 0, TEXT_PAYTABLE, !0, !0, !1, !1);
    this._createPayouts(a);
    this._aPages[0] = a;
    a = new createjs.Container;
    a.visible = !1;
    this._oContainer.addChild(a);
    b = s_oSpriteLibrary.getSprite("paytable2_landscape");
    c = createBitmap(b);
    c.x = CANVAS_WIDTH / 2;
    c.y = CANVAS_HEIGHT / 2;
    c.regX = b.width / 2;
    c.regY = b.height / 2;
    a.addChild(c);
    new CTLText(a, CANVAS_WIDTH / 2 - 300, CANVAS_HEIGHT / 2 - b.height / 2 + 104, 600, 46, 46,
       "center", "#fff", FONT_GAME_1, 1, 0, 0, TEXT_PAYLINES, !0, !0, !1, !1);
    this._aPages[1] = a;
    a = new createjs.Container;
    a.visible = !1;
    this._oContainer.addChild(a);
    b = s_oSpriteLibrary.getSprite("paytable3_landscape");
    c = createBitmap(b);
    c.x = CANVAS_WIDTH / 2;
    c.y = CANVAS_HEIGHT / 2;
    c.regX = b.width / 2;
    c.regY = b.height / 2;
    a.addChild(c);
    new CTLText(a, CANVAS_WIDTH / 2 - 300, CANVAS_HEIGHT / 2 - b.height / 2 + 104, 600, 46, 46,
       "center", "#fff", FONT_GAME_1, 1, 0, 0, TEXT_BONUS, !0, !0, !1, !1);
    new CTLText(a, 1E3, 735, 546, 118, 36, "center", "#dab977", FONT_GAME_1, 1, 0, 0,
       TEXT_HELP_BONUS1, !0, !0, !0, !1);
    new CTLText(a, 1E3, 920, 546, 280, 36, "center", "#dab977", FONT_GAME_1, 1, 0, 0,
       TEXT_HELP_BONUS2, !0, !0, !0, !1);
    this._aPages[2] = a;
    a = new createjs.Container;
    a.visible = !1;
    this._oContainer.addChild(a);
    b = s_oSpriteLibrary.getSprite("paytable4_landscape");
    c = createBitmap(b);
    c.x = CANVAS_WIDTH / 2;
    c.y = CANVAS_HEIGHT / 2;
    c.regX = b.width / 2;
    c.regY = b.height / 2;
    a.addChild(c);
    new CTLText(a, CANVAS_WIDTH / 2 - 300, CANVAS_HEIGHT / 2 - b.height / 2 + 104, 600, 46, 46,
       "center", "#fff", FONT_GAME_1, 1, 0, 0, TEXT_FREESPINS, !0, !0, !1, !1);
    c = 766;
    for (var d = 0; 3 > d; d++) b = new createjs.Text(d + 3 + "X  " + NUM_FREESPIN[d], "40px " +
          FONT_GAME_1, "#dab977"), b.textAlign = "left", b.x = CANVAS_WIDTH / 2 + 44, b.y = c, b.textBaseline =
       "alphabetic", a.addChild(b), c += 42;
    new CTLText(a, CANVAS_WIDTH / 2 - 280, 920, 560, 280, 56, "center", "#dab977", FONT_GAME_1, 1,
       0, 0, TEXT_HELP_FREESPIN, !0, !0, !0, !1);
    this._aPages[3] = a;
    this._oCurPage = this._aPages[this._iCurPage]
 };
 CPaytableLandscape.prototype._createPayouts = function(a) {
    this._aNumSymbolComboText = [];
    this._aWinComboText = [];
    for (var b = [{
          x: 1164,
          y: 1128
       }, {
          x: 800,
          y: 1128
       }, {
          x: 1340,
          y: 944
       }, {
          x: 990,
          y: 944
       }, {
          x: 636,
          y: 944
       }, {
          x: 1164,
          y: 756
       }, {
          x: 804,
          y: 756
       }], c = 0, d = 0; d < PAYTABLE_VALUES.length; d++) {
       var e = PAYTABLE_VALUES[d];
       do {
          var g = e.indexOf(0); - 1 !== g && e.splice(g, 1)
       } while (-1 !== g);
       g = e.length;
       if (0 !== g) {
          var l = 40;
          4 === g && (l = 32);
          var h = b[c].y;
          this._aNumSymbolComboText[d] = [];
          this._aWinComboText[d] = [];
          for (var f = 0; f < g; f++) {
             var k = new createjs.Text("X" + (5 - f), "40px " + FONT_GAME_1, "#ffffff");
             k.textAlign = "center";
             k.x = b[c].x;
             k.y = h;
             k.textBaseline = "alphabetic";
             a.addChild(k);
             this._aNumSymbolComboText[d][f] = k;
             var u = new createjs.Text(e[g - f - 1], "40px " + FONT_GAME_1, "#dab977");
             u.textAlign = "center";
             u.x = k.x + 70;
             u.y = k.y;
             u.textBaseline = "alphabetic";
             a.addChild(u);
             this._aWinComboText[d][f] = u;
             h += l
          }
          c++
       }
    }
 };
 
 function CPaytablePortrait(a) {
    CPaytablePanelBase.call(this, a);
    this._init();
    this.attachButs({
       x: 520,
       y: CANVAS_HEIGHT / 2
    }, {
       x: CANVAS_WIDTH - 520,
       y: CANVAS_HEIGHT / 2
    })
 }
 CPaytablePortrait.prototype = Object.create(CPaytablePanelBase.prototype);
 CPaytablePortrait.prototype._init = function() {
    CPaytablePanelBase.prototype._init.call(this);
    var a = new createjs.Container;
    this._oContainer.addChild(a);
    var b = s_oSpriteLibrary.getSprite("paytable1_portrait"),
       c = createBitmap(b);
    c.x = CANVAS_WIDTH / 2;
    c.y = CANVAS_HEIGHT / 2;
    c.regX = b.width / 2;
    c.regY = b.height / 2;
    a.addChild(c);
    new CTLText(a, CANVAS_WIDTH / 2 - 300, CANVAS_HEIGHT / 2 - b.height / 2 + 104, 600, 46, 46,
       "center", "#fff", FONT_GAME_1, 1, 0, 0, TEXT_PAYTABLE, !0, !0, !1, !1);
    this._createPayouts(a);
    this._aPages[0] = a;
    a = new createjs.Container;
    a.visible = !1;
    this._oContainer.addChild(a);
    b = s_oSpriteLibrary.getSprite("paytable2_portrait");
    c = createBitmap(b);
    c.x = CANVAS_WIDTH / 2;
    c.y = CANVAS_HEIGHT / 2;
    c.regX = b.width / 2;
    c.regY = b.height / 2;
    a.addChild(c);
    new CTLText(a, CANVAS_WIDTH / 2 - 300, CANVAS_HEIGHT / 2 - b.height / 2 + 104, 600, 46, 46,
       "center", "#fff", FONT_GAME_1, 1, 0, 0, TEXT_PAYLINES, !0, !0, !1, !1);
    this._aPages[1] = a;
    a = new createjs.Container;
    a.visible = !1;
    this._oContainer.addChild(a);
    b = s_oSpriteLibrary.getSprite("paytable3_portrait");
    c = createBitmap(b);
    c.x = CANVAS_WIDTH / 2;
    c.y = CANVAS_HEIGHT / 2;
    c.regX = b.width / 2;
    c.regY = b.height / 2;
    a.addChild(c);
    new CTLText(a, CANVAS_WIDTH / 2 - 300, CANVAS_HEIGHT / 2 - b.height / 2 + 104, 600, 46, 46,
       "center", "#fff", FONT_GAME_1, 1, 0, 0, TEXT_BONUS, !0, !0, !1, !1);
    new CTLText(a, 690, 664, 546, 118, 36, "center", "#dab977", FONT_GAME_1, 1, 0, 0,
       TEXT_HELP_BONUS1, !0, !0, !0, !1);
    new CTLText(a, 690, 1154, 546, 280, 36, "center", "#dab977", FONT_GAME_1, 1, 0, 0,
       TEXT_HELP_BONUS2, !0, !0, !0, !1);
    this._aPages[2] = a;
    a = new createjs.Container;
    a.visible = !1;
    this._oContainer.addChild(a);
    b = s_oSpriteLibrary.getSprite("paytable4_portrait");
    c = createBitmap(b);
    c.x = CANVAS_WIDTH / 2;
    c.y = CANVAS_HEIGHT / 2;
    c.regX = b.width / 2;
    c.regY = b.height / 2;
    a.addChild(c);
    new CTLText(a, CANVAS_WIDTH / 2 - 300, CANVAS_HEIGHT / 2 - b.height / 2 + 104, 600, 46, 46,
       "center", "#fff", FONT_GAME_1, 1, 0, 0, TEXT_FREESPINS, !0, !0, !1, !1);
    c = 750;
    for (var d = 0; 3 > d; d++) b = new createjs.Text(d + 3 + "X  " + NUM_FREESPIN[d], "40px " +
          FONT_GAME_1, "#dab977"), b.textAlign = "left", b.x = CANVAS_WIDTH / 2 + 44, b.y = c, b.textBaseline =
       "alphabetic", a.addChild(b), c += 42;
    new CTLText(a, CANVAS_WIDTH / 2 - 280, 910, 560, 270, 56, "center", "#dab977", FONT_GAME_1, 1,
       0, 0, TEXT_HELP_FREESPIN, !0, !0, !0, !1);
    this._aPages[3] = a;
    this._oCurPage = this._aPages[this._iCurPage]
 };
 CPaytablePortrait.prototype._createPayouts = function(a) {
    this._aNumSymbolComboText = [];
    this._aWinComboText = [];
    for (var b = [{
          x: 990,
          y: 1220
       }, {
          x: 1164,
          y: 1026
       }, {
          x: 804,
          y: 1026
       }, {
          x: 1164,
          y: 828
       }, {
          x: 804,
          y: 828
       }, {
          x: 1164,
          y: 628
       }, {
          x: 804,
          y: 628
       }], c = 0, d = 0; d < PAYTABLE_VALUES.length; d++) {
       var e = PAYTABLE_VALUES[d];
       do {
          var g = e.indexOf(0); - 1 !== g && e.splice(g, 1)
       } while (-1 !== g);
       g = e.length;
       if (0 !== g) {
          var l = 40;
          4 === g && (l = 32);
          var h = b[c].y;
          this._aNumSymbolComboText[d] = [];
          this._aWinComboText[d] = [];
          for (var f = 0; f < g; f++) {
             var k = new createjs.Text("X" + (5 - f), "40px " + FONT_GAME_1, "#ffffff");
             k.textAlign = "center";
             k.x = b[c].x;
             k.y = h;
             k.textBaseline = "alphabetic";
             a.addChild(k);
             this._aNumSymbolComboText[d][f] = k;
             var u = new createjs.Text(e[g - f - 1], "40px " + FONT_GAME_1, "#dab977");
             u.textAlign = "center";
             u.x = k.x + 70;
             u.y = k.y;
             u.textBaseline = "alphabetic";
             a.addChild(u);
             this._aWinComboText[d][f] = u;
             h += l
          }
          c++
       }
    }
 };
 
 function CStaticSymbolCell(a, b, c, d, e) {
    var g, l, h, f, k = -1,
       u, p, t, B, A, D, F;
    this._init = function(m, J, I, E) {
       h = I;
       f = E;
       g = 0;
       F = new createjs.Container;
       e.addChild(F);
       D = new createjs.Container;
       D.visible = !1;
       D.x = I;
       D.y = E;
       F.addChild(D);
       D.scale = .5 * REEL_SCALE;
       u = [];
       for (m = 0; m < NUM_SYMBOLS; m++) J = createSprite(s_aSymbolAnims[m], "static", 0, 0,
          SYMBOL_ANIM_WIDTH, SYMBOL_ANIM_HEIGHT), J.x = 94, J.y = 112, J.on("animationend",
          this._onAnimEnded, null, !1), D.addChild(J), u[m] = J, u[m].visible = !1;
       m = [];
       for (J = 0; 17 > J; J++) m.push(s_oSpriteLibrary.getSprite("win_frame_anim_big_" + J));
       m = {
          images: m,
          frames: {
             width: WIN_BIG_ANIM_WIDTH,
             height: WIN_BIG_ANIM_HEIGHT
          },
          animations: {
             "static": 0,
             anim: [0, 64]
          }
       };
       m = new createjs.SpriteSheet(m);
       t = createSprite(m, "static", 0, 0, WIN_BIG_ANIM_WIDTH, WIN_BIG_ANIM_HEIGHT);
       t.x = -14;
       t.y = -32;
       D.addChild(t);
       m = s_oSpriteLibrary.getSprite("amount_bonus_win");
       A = createBitmap(m);
       A.regX = m.width / 2;
       A.regY = m.height / 2;
       A.x = WIN_BIG_ANIM_WIDTH / 2 + t.x;
       A.y = WIN_BIG_ANIM_HEIGHT - m.height / 2 + t.y - 6;
       D.addChild(A);
       B = new CTLText(D, A.x - m.width / 2, A.y - m.height / 2, m.width, m.height - 20, 76,
          "center", "#dab977", FONT_GAME_1, 1.1, 0, 0, " ", !0, !0, !1, !1);
       m = {
          images: [s_oSpriteLibrary.getSprite("win_frame_anim")],
          framerate: 40,
          frames: {
             width: 285,
             height: 264
          },
          animations: {
             "static": 0,
             anim_0: [0, 42],
             anim_1: [15, 42, "anim_0"],
             anim_2: [30, 42, "anim_0"]
          }
       };
       m = new createjs.SpriteSheet(m);
       p = createSprite(m, "static", 0, 0, 285, 264);
       p.x = I - 45;
       p.y = E - 50;
       p.scale = REEL_SCALE;
       F.addChild(p)
    };
    this.unload = function() {
       e.removeChild(F)
    };
    this.hide = function() {
       -1 < k && (stopSound("symbol" + k), p.gotoAndStop("static"), p.visible = !1, t.gotoAndStop(
          "static"), t.visible = !1, A.visible = !1, B.refreshText(" "), u[k].gotoAndPlay(
          "static"), u[k].visible = !1, F.visible = !1, k = -1)
    };
    this.setVisible = function(m) {
       F.visible = m
    };
    this.show = function(m, J, I, E, w) {
       g = 0;
       l = w;
       for (w = 0; w < NUM_SYMBOLS; w++) u[w].visible = w + 1 === m ? !0 : !1;
       A.visible = !1;
       0 < J ? (B.refreshText(formatEntries(J)), A.visible = !0) : B.refreshText(" ");
       t.gotoAndPlay("anim");
       t.visible = !0;
       u[m - 1].gotoAndPlay("anim");
       k = m - 1;
       u[m - 1].spriteSheet.getNumFrames();
       D.regX = E.x;
       D.regY = E.y;
       D.x = h + I.x;
       D.y = f + I.y;
       D.scale = .5 * REEL_SCALE;
       D.visible = !0;
       D.alpha = 1;
       F.visible = !0;
       createjs.Tween.get(D).to({
          scale: REEL_SCALE
       }, 1E3, createjs.Ease.cubicOut);
       playSound("symbol" + k, 1, !1)
    };
    this.showWinFrame = function() {
       p.gotoAndPlay("anim_" + Math.floor(3 * Math.random()));
       p.visible = !0;
       F.visible = !0
    };
    this.hideWinFrame = function() {
       createjs.Tween.removeTweens(D);
       p.gotoAndPlay("static");
       p.visible = !1;
       F.visible = !1
    };
    this._onAnimEnded = function() {
       g++;
       g === l && -1 < k && (u[k].stop(), createjs.Tween.get(D).wait(1E3).to({
          scale: .52,
          alpha: 0
       }, 500, createjs.Ease.cubicOut).call(function() {
          N.stopAnim();
          s_oGame.showWin()
       }))
    };
    this.stopAnim = function() {
       -1 !== k && (stopSound("symbol" + k), u[k].visible = !1, D.visible = !1, p.gotoAndStop(
          "static"), p.visible = !1)
    };
    var N = this;
    this._init(a, b, c, d)
 }
 
 function CTweenController() {
    this.tweenValue = function(a, b, c) {
       return a + c * (b - a)
    };
    this.easeLinear = function(a, b, c, d) {
       return c * a / d + b
    };
    this.easeInCubic = function(a, b, c, d) {
       d = (a /= d) * a * a;
       return b + c * d
    };
    this.easeBackInQuart = function(a, b, c, d) {
       d = (a /= d) * a;
       return b + c * (2 * d * d + 2 * d * a + -3 * d)
    };
    this.easeInBack = function(a, b, c, d) {
       return c * (a /= d) * a * (2.70158 * a - 1.70158) + b
    };
    this.easeOutBack = function(a, b, c, d) {
       return c * ((a = a / d - 1) * a * (2.70158 * a + 1.70158) + 1) + b
    };
    this.easeOutCubic = function(a, b, c, d) {
       return c * ((a = a / d - 1) * a * a + 1) + b
    };
    this.getTrajectoryPoint = function(a, b) {
       var c = new createjs.Point,
          d = (1 - a) * (1 - a),
          e = a * a;
       c.x = d * b.start.x + 2 * (1 - a) * a * b.traj.x + e * b.end.x;
       c.y = d * b.start.y + 2 * (1 - a) * a * b.traj.y + e * b.end.y;
       return c
    }
 }
 
 function CMsgBox() {
    var a, b, c, d, e, g, l;
    this._init = function() {
       l = new createjs.Container;
       l.visible = !1;
       s_oStage.addChild(l);
       b = new createjs.Shape;
       b.graphics.beginFill("rgba(0,0,0,0.7)").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       a = b.on("click", function() {});
       l.addChild(b);
       var h = s_oSpriteLibrary.getSprite("msg_box");
       g = new createjs.Container;
       g.x = CANVAS_WIDTH / 2;
       g.y = CANVAS_HEIGHT / 2;
       g.regX = h.width / 2;
       g.regY = h.height / 2;
       g.scale = 0;
       l.addChild(g);
       c = createBitmap(h);
       g.addChild(c);
       d = new CTLText(g, 70, 60, h.width - 140, 400, 42, "center", "#dab977", FONT_GAME_1, 1, 0,
          0, " ", !0, !0, !0, !1);
       e = new CGfxButton(h.width / 2, h.height - 150, s_oSpriteLibrary.getSprite("but_yes"), g);
       e.addEventListener(ON_MOUSE_UP, this._onExit, this)
    };
    this.unload = function() {
       b.off("click", a);
       e.unload()
    };
    this.show = function(h) {
       d.refreshText(h);
       l.visible = !0;
       b.alpha = 0;
       createjs.Tween.get(b).to({
          alpha: .7
       }, 300, createjs.Ease.quartOut);
       createjs.Tween.get(g).to({
          scale: 1
       }, 1E3, createjs.Ease.elasticOut)
    };
    this.hide = function() {
       e.disable();
       createjs.Tween.get(b).to({
          alpha: 0
       }, 500, createjs.Ease.quartOut);
       createjs.Tween.get(g).to({
          scale: 0
       }, 500, createjs.Ease.backIn).call(function() {
          l.visible = !1
       })
    };
    this._onExit = function() {
       this.hide()
    };
    this._init()
 }
 
 function CBonusPanel() {
    var a, b, c, d, e = !1,
       g, l, h, f, k, u, p, t, B, A, D, F, N, m, J, I, E, w, z, C = null,
       R, S, y, x;
    this._init = function() {
       e = !0;
       p = [0, 450, 820];
       t = [0, 600, 1120];
       x.removeAllChildren();
       x.visible = !1;
       I = new CBonusBg(x);
       var n = createBitmap(s_oSpriteLibrary.getSprite("ship_bonus_0"));
       n.y = 1248;
       x.addChild(n);
       n = createBitmap(s_oSpriteLibrary.getSprite("ship_bonus_1"));
       n.y = 20;
       x.addChild(n);
       n = createBitmap(s_oSpriteLibrary.getSprite("ship_bonus_2"));
       n.x = 310;
       n.y = 1098;
       x.addChild(n);
       S = new createjs.Container;
       S.x = CANVAS_WIDTH / 2 - 80;
       S.y = CANVAS_HEIGHT / 2 + 400;
       x.addChild(S);
       this._initCannonButtons();
       b = a = 20;
       J = new createjs.Container;
       J.x = a;
       J.y = b;
       x.addChild(J);
       n = s_oSpriteLibrary.getSprite("hit_counter");
       n = createBitmap(n);
       J.addChild(n);
       R = new CTLText(J, 102, 106, 45, 32, 32, "center", "#dab977", FONT_GAME_1, 1, 0, 0, "x0", !
          0, !0, !1, !1);
       n = s_oSpriteLibrary.getSprite("amount_bonus_win");
       c = CANVAS_WIDTH - 20;
       d = 20;
       m = new createjs.Container;
       m.x = c;
       m.y = d;
       m.regX = n.width;
       x.addChild(m);
       var L = createBitmap(n);
       m.addChild(L);
       N = new CTLText(m, 40, 28, n.width - 80, 80, 56, "center", "#dab977", FONT_GAME_1, 1, 0, 0,
          formatEntries(0), !0, !0, !1, !1);
       y = new createjs.Shape;
       y.graphics.beginFill("rgba(0,0,0,0.01)").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       F = y.on("click", function() {});
       x.addChild(y);
       this.refreshButtonPos();
       this._startBonus()
    };
    this._loadAllResources = function() {
       x = new createjs.Container;
       s_oAttachSection.addChild(x);
       var n = s_oSpriteLibrary.getSprite("bg_loading_bonus");
       E = createBitmap(n);
       x.addChild(E);
       n = s_oSpriteLibrary.getSprite("bg_loading_bonus_text");
       var L = createBitmap(n);
       L.x = CANVAS_WIDTH / 2;
       L.y = CANVAS_HEIGHT / 2;
       L.regX = n.width / 2;
       L.regY = n.height / 2;
       x.addChild(L);
       n = s_oSpriteLibrary.getSprite("progress_bar");
       z = createBitmap(n);
       z.x = CANVAS_WIDTH / 2 - n.width / 2;
       z.y = CANVAS_HEIGHT / 2 + 210;
       x.addChild(z);
       l = n.width;
       h = n.height;
       D = new createjs.Shape;
       D.graphics.beginFill("rgba(255,255,255,0.01)").drawRect(z.x, z.y, 1, h);
       x.addChild(D);
       z.mask = D;
       w = new createjs.Text("0%", "30px " + FONT_GAME_1, "#dab977");
       w.x = CANVAS_WIDTH / 2;
       w.y = CANVAS_HEIGHT / 2 + 200;
       w.shadow = new createjs.Shadow("#000", 2, 2, 2);
       w.textBaseline = "alphabetic";
       w.textAlign = "center";
       x.addChild(w);
       s_oSpriteLibrary.init(this._onResourceBonusLoaded, this._onAllImagesLoaded, this);
       s_oSpriteLibrary.addSprite("bg_bonus", "./sprites/bonus/bg_bonus.jpg");
       s_oSpriteLibrary.addSprite("enemy_ship", "./sprites/bonus/enemy_ship.png");
       s_oSpriteLibrary.addSprite("enemy_ship_fire", "./sprites/bonus/enemy_ship_fire.png");
       s_oSpriteLibrary.addSprite("enemy_ship_hit", "./sprites/bonus/enemy_ship_hit.png");
       s_oSpriteLibrary.addSprite("ship_seaboard", "./sprites/bonus/ship_seaboard.png");
       s_oSpriteLibrary.addSprite("fog", "./sprites/bonus/fog.png");
       for (n = 0; 5 > n; n++) s_oSpriteLibrary.addSprite("waves_" + n, "./sprites/bonus/waves-" +
          n + ".png");
       s_oSpriteLibrary.addSprite("splash", "./sprites/bonus/splash.png");
       s_oSpriteLibrary.addSprite("ship_bonus_0", "./sprites/bonus/ship_bonus_0.jpg");
       s_oSpriteLibrary.addSprite("ship_bonus_1", "./sprites/bonus/ship_bonus_1.png");
       s_oSpriteLibrary.addSprite("ship_bonus_2", "./sprites/bonus/ship_bonus_2.png");
       s_oSpriteLibrary.addSprite("but_fire", "./sprites/bonus/but_fire.png");
       s_oSpriteLibrary.addSprite("hit_counter", "./sprites/bonus/hit_counter.png");
       s_oSpriteLibrary.addSprite("enemy_pirate", "./sprites/bonus/enemy_pirate.png");
       for (n = 0; 3 > n; n++) {
          L = 6;
          0 === n && (L = 7);
          for (var ea = 0; ea < L; ea++) s_oSpriteLibrary.addSprite("cannon_" + n + "_" + ea,
             "./sprites/bonus/cannons/cannon_" + n + "-" + ea + ".png")
       }
       f = 0;
       k = s_oSpriteLibrary.getNumSprites();
       0 === k ? this._startBonus() : s_oSpriteLibrary.loadSprites()
    };
    this._onResourceBonusLoaded = function() {
       f++;
       var n = Math.floor(f / k * 100);
       w.text = n + "%";
       D.graphics.clear();
       n = Math.floor(n * l / 100);
       D.graphics.beginFill("rgba(255,255,255,0.01)").drawRect(z.x, z.y, n, h);
       f === k && this._init()
    };
    this.unload = function() {
       y.off("click", F);
       for (var n = 0; n < A.length; n++) A[n].unload()
    };
    this._onAllImagesLoaded = function() {};
    this.reset = function() {
       I.reset();
       N.refreshText(formatEntries(0));
       null !== C && (C.unload(), C = null)
    };
    this.refreshButtonPos = function() {
       if (void 0 !== t) {
          void 0 !== m && (m.x = c - s_iOffsetX, m.y = d + s_iOffsetY);
          J.x = a + s_iOffsetX;
          J.y = b + s_iOffsetY;
          if (s_bLandscape) {
             for (var n = 0; n < t.length; n++) A[n].setX(t[n]);
             S.x = CANVAS_WIDTH / 2 - 130;
             S.scale = 1
          } else {
             for (n = 0; n < p.length; n++) A[n].setX(p[n]);
             S.x = CANVAS_WIDTH / 2 - 80;
             S.scale = .9
          }
          S.regX = S.getBounds().width / 2;
          S.regY = S.getBounds().height
       }
    };
    this.show = function(n, L) {
       B = n;
       e ? this._startBonus() : this._loadAllResources()
    };
    this.hide = function() {
       stop("bonus_soundtrack");
       I.endBonus();
       x.visible = !1;
       this.reset();
       s_oGame.exitFromBonus(u)
    };
    this._startBonus = function() {
       this.refreshButtonPos();
       u = 0;
       R.refreshText("x" + B.length);
       I.startBonus();
       x.visible = !0;
       this.enableAllButtons();
       playSound("bonus_soundtrack", 1, !0)
    };
    this.endBonus = function() {
       new CBonusResultPanel(u, x);
       playSound("end_bonus", 1, !1)
    };
    this._initCannonButtons = function() {
       var n = [];
       A = [];
       for (var L = [
             [
                [1, 1, 537, 470, 0, -109, -177],
                [540, 1, 572, 488, 0, -86, -181],
                [1114, 1, 659, 691, 0, -18, -47],
                [1, 694, 637, 702, 0, -36, -30],
                [640, 694, 652, 698, 0, -21, -23],
                [1294, 694, 639, 580, 0, -26, -137],
                [1, 1398, 622, 585, 0, -38, -133],
                [625, 1398, 583, 566, 0, -75, -128],
                [1210, 1398, 565, 552, 0, -90, -126],
                [1, 1, 549, 539, 1, -102, -124],
                [552, 1, 541, 529, 1, -108, -122],
                [1095, 1, 537, 527, 1, -109, -120],
                [1, 542, 537, 529, 1, -109, -118],
                [540, 542, 537, 530, 1, -109, -117],
                [1079, 542, 537, 534, 1, -109, -113],
                [1, 1078, 537, 534, 1, -109, -113],
                [540, 1078, 537, 537, 1, -109, -110],
                [1079, 1078, 537, 540, 1, -109, -107],
                [1, 1, 537, 540, 2, -109, -107],
                [540, 1, 537, 541, 2, -109, -106],
                [1079, 1, 537, 544, 2, -109, -103],
                [1, 547, 537, 547, 2, -109, -100],
                [540, 547, 537, 547, 2, -109, -100],
                [1079, 547, 537, 550, 2, -109, -97],
                [1, 1099, 537, 553, 2, -109, -94],
                [540, 1099, 537, 555, 2, -109, -92],
                [1079, 1099, 537, 557, 2, -109, -90],
                [1, 1, 537, 559, 3, -109, -88],
                [540, 1, 537, 560, 3, -109, -87],
                [1079, 1, 537, 562, 3, -109, -85],
                [1, 565, 537, 564, 3, -109, -83],
                [540, 565, 537, 566, 3, -109, -81],
                [1079, 565, 537, 567, 3, -109, -80],
                [1, 1134, 537, 567, 3, -109, -80],
                [540, 1134, 537, 569, 3, -109, -78],
                [1079, 1134, 537, 571, 3, -109, -76],
                [1, 1, 537, 572, 4, -109, -75],
                [540, 1, 537, 572, 4, -109, -75],
                [1079, 1, 537, 574, 4, -109, -73],
                [1, 577, 537, 575, 4, -109, -72],
                [540, 577, 537, 576, 4, -109, -71],
                [1079, 577, 537, 578, 4, -109, -69],
                [1, 1157, 537, 580, 4, -109, -67],
                [540, 1157, 537, 581, 4, -109, -66],
                [1079, 1157, 537, 585, 4, -109, -62],
                [1, 1, 537, 588, 5, -109, -59],
                [540, 1, 537, 590, 5, -109, -57],
                [1079, 1, 537, 592, 5, -109, -55],
                [1, 595, 537, 595, 5, -109, -52],
                [540, 595, 537, 597, 5, -109, -50],
                [1079, 595, 537, 600, 5, -109, -47],
                [1, 1197, 537, 603, 5, -109, -44],
                [540, 1197, 537, 606, 5, -109, -41],
                [1079, 1197, 537, 607, 5, -109, -40],
                [1, 1, 537, 609, 6, -109, -38],
                [540, 1, 537, 612, 6, -109, -35],
                [1079, 1, 537, 611, 6, -109, -36],
                [1, 615, 537, 612, 6, -109, -35],
                [540, 615, 537, 612, 6, -109, -35],
                [1079, 615, 537, 603, 6, -109, -44],
                [1, 1229, 537, 594, 6, -109, -53],
                [540, 1229, 537, 540, 6, -109, -107]
             ],
             [
                [1, 1, 477, 471, 0, -89, -178],
                [480, 1, 471, 490, 0, -101, -182],
                [953, 1, 523, 698, 0, -82, -45],
                [1478, 1, 525, 711,
                   0, -80, -29
                ],
                [1, 714, 517, 702, 0, -73, -22],
                [520, 714, 511, 586, 0, -72, -135],
                [1033, 714, 509, 590, 0, -82, -131],
                [1, 1418, 521, 570, 0, -73, -127],
                [524, 1418, 511, 556, 0, -77, -125],
                [1037, 1418, 502, 543, 0, -83, -123],
                [1541, 1418, 475, 531, 0, -107, -121],
                [1, 1, 500, 531, 1, -105, -118],
                [503, 1, 500, 532, 1, -105, -117],
                [1005, 1, 500, 534, 1, -105, -115],
                [1507, 1, 500, 537, 1, -105, -112],
                [1, 540, 500, 538, 1, -105, -111],
                [503, 540, 500, 541, 1, -105, -108],
                [1005, 540, 500, 542, 1, -105, -107],
                [1507, 540, 500, 544, 1, -105, -105],
                [1, 1086, 500, 545, 1, -105, -104],
                [503, 1086, 500, 547, 1, -105, -102],
                [1005, 1086, 500, 551, 1, -105, -98],
                [1507, 1086, 500, 551, 1, -105, -98],
                [1, 1, 500, 554, 2, -105, -95],
                [503, 1, 500, 557, 2, -105, -92],
                [1005, 1, 500, 557, 2, -105, -92],
                [1507, 1, 500, 560, 2, -105, -89],
                [1, 563, 500, 563, 2, -105, -86],
                [503, 563, 500, 564, 2, -105, -85],
                [1005, 563, 500, 566, 2, -105, -83],
                [1507, 563, 500, 567, 2, -105, -82],
                [1, 1132, 500, 569, 2, -105, -80],
                [503, 1132, 500, 569, 2, -105, -80],
                [1005, 1132, 500, 571, 2, -105, -78],
                [1507, 1132, 500, 572, 2, -105, -77],
                [1, 1, 500, 574, 3, -105, -75],
                [503, 1, 500, 575, 3, -105, -74],
                [1005, 1, 500, 576, 3, -105, -73],
                [1507, 1, 500,
                   577, 3, -105, -72
                ],
                [1, 580, 500, 578, 3, -105, -71],
                [503, 580, 500, 579, 3, -105, -70],
                [1005, 580, 500, 581, 3, -105, -68],
                [1507, 580, 500, 584, 3, -105, -65],
                [1, 1166, 500, 585, 3, -105, -64],
                [503, 1166, 500, 587, 3, -105, -62],
                [1005, 1166, 500, 592, 3, -105, -57],
                [1507, 1166, 500, 594, 3, -105, -55],
                [1, 1, 500, 595, 4, -105, -54],
                [503, 1, 500, 599, 4, -105, -50],
                [1005, 1, 500, 600, 4, -105, -49],
                [1507, 1, 500, 603, 4, -105, -46],
                [1, 606, 500, 607, 4, -105, -42],
                [503, 606, 500, 609, 4, -105, -40],
                [1005, 606, 500, 611, 4, -105, -38],
                [1507, 606, 500, 613, 4, -105, -36],
                [1, 1221, 500, 614, 4, -105, -35],
                [503, 1221, 500, 614, 4, -105, -35],
                [1005, 1221, 500, 614, 4, -105, -35],
                [1507, 1221, 500, 614, 4, -105, -35],
                [1, 1, 500, 606, 5, -105, -43],
                [1, 609, 500, 597, 5, -105, -52],
                [1, 1208, 500, 543, 5, -105, -106]
             ],
             [
                [1, 1, 513, 471, 0, -82, -176],
                [516, 1, 512, 487, 0, -101, -180],
                [1030, 1, 641, 687, 0, -52, -43],
                [1, 690, 655, 704, 0, -38, -26],
                [658, 690, 653, 702, 0, -13, -18],
                [1313, 690, 528, 582, 0, -112, -133],
                [1, 1396, 524, 588, 0, -98, -128],
                [527, 1396, 510, 570, 0, -112, -124],
                [1039, 1396, 512, 556, 0, -96, -122],
                [1, 1, 509, 544, 1, -89, -119],
                [512, 1, 494, 533, 1, -101, -117],
                [1008, 1, 495, 531, 1, -100, -116],
                [1505, 1, 495, 533, 1, -100, -114],
                [1, 547, 495, 535, 1, -100, -112],
                [498, 547, 495, 539, 1, -100, -108],
                [995, 547, 495, 539, 1, -100, -108],
                [1492, 547, 495, 541, 1, -100, -106],
                [1, 1090, 495, 544, 1, -100, -103],
                [498, 1090, 495, 545, 1, -100, -102],
                [995, 1090, 495, 546, 1, -100, -101],
                [1492, 1090, 495, 549, 1, -100, -98],
                [1, 1, 495, 551, 2, -100, -96],
                [498, 1, 495, 552, 2, -100, -95],
                [995, 1, 495, 555, 2, -100, -92],
                [1492, 1, 495, 558, 2, -100, -89],
                [1, 561, 495, 559, 2, -100, -88],
                [498, 561, 495, 561, 2, -100, -86],
                [995, 561, 495, 564, 2, -100, -83],
                [1492, 561, 495, 565, 2, -100, -82],
                [1, 1128, 495, 567, 2, -100, -80],
                [498, 1128, 495, 568, 2, -100, -79],
                [995, 1128, 495, 570, 2, -100, -77],
                [1492, 1128, 495, 571, 2, -100, -76],
                [1, 1, 495, 572, 3, -100, -75],
                [498, 1, 495, 574, 3, -100, -73],
                [995, 1, 495, 576, 3, -100, -71],
                [1492, 1, 495, 576, 3, -100, -71],
                [1, 579, 495, 576, 3, -100, -71],
                [498, 579, 495, 578, 3, -100, -69],
                [995, 579, 495, 579, 3, -100, -68],
                [1492, 579, 495, 580, 3, -100, -67],
                [1, 1161, 495, 583, 3, -100, -64],
                [498, 1161, 495, 585, 3, -100, -62],
                [995, 1161, 495, 585, 3, -100, -62],
                [1492, 1161, 495, 589, 3, -100, -58],
                [1, 1, 495, 593, 4, -100, -54],
                [498, 1, 495, 594, 4, -100, -53],
                [995, 1, 495, 596, 4, -100, -51],
                [1492, 1, 495, 600, 4, -100, -47],
                [1, 603, 495, 602, 4, -100, -45],
                [498, 603, 495, 604, 4, -100, -43],
                [995, 603, 495, 608, 4, -100, -39],
                [1492, 603, 495, 611, 4, -100, -36],
                [1, 1216, 495, 612, 4, -100, -35],
                [498, 1216, 495, 613, 4, -100, -34],
                [995, 1216, 495, 616, 4, -100, -31],
                [1492, 1216, 495, 615, 4, -100, -32],
                [1, 1, 495, 616, 5, -100, -31],
                [498, 1, 495, 616, 5, -100, -31],
                [1, 619, 495, 607, 5, -100, -40],
                [498, 619, 495, 598, 5, -100, -49],
                [1, 1228, 495, 545, 5, -100, -102]
             ]
          ], ea = [{
             x: 300,
             y: 420
          }, {
             x: 300,
             y: 420
          }, {
             x: 360,
             y: 420
          }], O = 0; 3 > O; O++) {
          var W = [],
             fa = 6;
          0 === O && (fa = 7);
          for (var q = 0; q < fa; q++) W.push(s_oSpriteLibrary.getSprite("cannon_" + O + "_" + q));
          n[O] = new createjs.SpriteSheet({
             images: W,
             framerate: 35,
             frames: L[O],
             animations: {
                idle: 0,
                anim: [0, 61, "idle"]
             }
          });
          W = new CBonusBut(O, n[O], s_bLandscape ? t[O] : p[O], 0, ea[O], S);
          W.addEventListener(ON_MOUSE_UP, this._onButtonRelease, this);
          W.addEventListener(ON_CANNON_ANIM_END, this._onCannonAnimEnd, this);
          A.push(W)
       }
    };
    this._disableAllButtons = function() {
       for (var n = 0; n < A.length; n++) A[n].setButVisible(!1);
       y.visible = !0
    };
    this.enableAllButtons = function() {
       for (var n = 0; n < A.length; n++) A[n].setButVisible(!0);
       y.visible = !1
    };
    this.refreshScoreAmount = function() {
       N.refreshText(formatEntries(u))
    };
    this._onButtonRelease = function(n) {
       s_oBonusPanel._disableAllButtons();
       playSound("bonus_game_cannon_fire", 1, !1);
       g = B.shift();
       A[n].playAnim();
       R.refreshText("x" + B.length)
    };
    this._checkHit = function() {
       0 < g ? I.hitShip(g) : I.missShip()
    };
    this._onCannonAnimEnd = function() {
       u += g;
       s_oBonusPanel.refreshScoreAmount();
       s_oBonusPanel._checkHit()
    };
    this.checkEndBonus = function() {
       0 === B.length ? this.endBonus() : s_oBonusPanel.enableAllButtons()
    };
    s_oBonusPanel = this
 }
 var s_oBonusPanel = null;
 
 function CBonusResultPanel(a, b) {
    var c, d;
    this._init = function(e) {
       c = new createjs.Container;
       b.addChild(c);
       var g = s_oSpriteLibrary.getSprite("msg_box_win");
       d = new createjs.Container;
       d.x = CANVAS_WIDTH / 2;
       d.y = CANVAS_HEIGHT / 2;
       d.regX = g.width / 2;
       d.regY = g.height / 2;
       d.scale = 0;
       c.addChild(d);
       var l = createBitmap(g);
       d.addChild(l);
       (new CTLText(d, 120, 210, g.width - 240, 400, 70, "center", "#dab977", FONT_GAME_1, 1, 0,
          0, TEXT_CONGRATS + "\n\n" + TEXT_YOU_WIN + "\n" + formatEntries(e), !0, !0, !0, !1)).setShadow
          ("#000", 4, 4, 2);
       var h = this;
       createjs.Tween.get(d).to({
          scale: 1
       }, 1E3, createjs.Ease.elasticOut).call(function() {
          setTimeout(function() {
             h.hide()
          }, 3E3)
       })
    };
    this.hide = function() {
       createjs.Tween.get(d).to({
          scale: 0
       }, 500, createjs.Ease.backIn).call(function() {
          b.removeChild(c);
          s_oBonusPanel.hide()
       })
    };
    this._init(a)
 }
 
 function CBonusBut(a, b, c, d, e, g) {
    var l, h, f, k, u, p;
    this._init = function(t, B, A, D) {
       l = !1;
       h = [];
       f = [];
       k = new createjs.Container;
       k.x = B;
       k.y = A;
       g.addChild(k);
       u = createSprite(t, "idle");
       u.on("animationend", this._onCannonAnimEnd, this);
       k.addChild(u);
       p = new CGfxButton(D.x, D.y, s_oSpriteLibrary.getSprite("but_fire"), k);
       p.pulseAnimation();
       p.addEventListener(ON_MOUSE_UP, this.buttonRelease, this)
    };
    this.unload = function() {
       p.unload();
       g.removeChild(k)
    };
    this.setVisible = function(t) {
       k.visible = t
    };
    this.setButVisible = function(t) {
       p.setVisible(t)
    };
    this.addEventListener = function(t, B, A) {
       h[t] = B;
       f[t] = A
    };
    this.buttonRelease = function() {
       l || h[ON_MOUSE_UP] && h[ON_MOUSE_UP].call(f[ON_MOUSE_UP], a)
    };
    this.buttonDown = function() {
       l || h[ON_MOUSE_DOWN] && h[ON_MOUSE_DOWN].call(f[ON_MOUSE_DOWN])
    };
    this.setX = function(t) {
       k.x = t
    };
    this.playAnim = function() {
       u.gotoAndPlay("anim")
    };
    this._onCannonAnimEnd = function(t) {
       "anim" === t.name && h[ON_CANNON_ANIM_END] && h[ON_CANNON_ANIM_END].call(f[
          ON_CANNON_ANIM_END], a)
    };
    this._init(b, c, d, e)
 }
 
 function CBonusBg(a) {
    var b, c, d, e, g, l, h, f, k, u;
    this._init = function() {
       u = new createjs.Container;
       a.addChild(u);
       var p = new createjs.Shape;
       p.graphics.beginFill("#2658b0").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       u.addChild(p);
       p = s_oSpriteLibrary.getSprite("bg_bonus");
       p = createBitmap(p);
       u.addChild(p);
       k = new createjs.Container;
       k.x = CANVAS_WIDTH / 2;
       k.y = 1296;
       u.addChild(k);
       p = s_oSpriteLibrary.getSprite("enemy_ship");
       var t = createBitmap(p);
       k.addChild(t);
       k.regX = p.width / 2;
       k.regY = p.height;
       p = createBitmap(s_oSpriteLibrary.getSprite("ship_seaboard"));
       p.x = 658;
       p.y = 1225;
       u.addChild(p);
       p = createBitmap(s_oSpriteLibrary.getSprite("fog"));
       p.y = 594;
       u.addChild(p);
       p = [];
       for (t = 0; 5 > t; t++) p.push(s_oSpriteLibrary.getSprite("waves_" + t));
       p = new createjs.SpriteSheet({
          images: p,
          framerate: 40,
          frames: [
             [1, 1, 960, 129, 0, 0, -6],
             [963, 1, 960, 129, 0, 0, -6],
             [1, 132, 960, 129, 0, 0, -6],
             [963, 132, 960, 129, 0, 0, -6],
             [1, 263, 960, 129, 0, 0, -6],
             [963, 263, 960, 129, 0, 0, -6],
             [1, 394, 960, 129, 0, 0, -6],
             [963, 394, 960, 129, 0, 0, -6],
             [1, 525, 960, 129, 0, 0, -6],
             [963, 525, 960, 129, 0, 0, -6],
             [1, 656, 960, 129, 0, 0, -6],
             [963, 656, 960,
                129, 0, 0, -6
             ],
             [1, 787, 960, 129, 0, 0, -6],
             [963, 787, 960, 129, 0, 0, -6],
             [1, 918, 960, 129, 0, 0, -6],
             [963, 918, 960, 129, 0, 0, -6],
             [1, 1049, 960, 129, 0, 0, -6],
             [963, 1049, 960, 129, 0, 0, -6],
             [1, 1180, 960, 129, 0, 0, -6],
             [963, 1180, 960, 129, 0, 0, -6],
             [1, 1311, 960, 129, 0, 0, -6],
             [963, 1311, 960, 129, 0, 0, -6],
             [1, 1442, 960, 129, 0, 0, -6],
             [963, 1442, 960, 129, 0, 0, -6],
             [1, 1573, 960, 129, 0, 0, -6],
             [963, 1573, 960, 129, 0, 0, -6],
             [1, 1704, 960, 129, 0, 0, -6],
             [963, 1704, 960, 129, 0, 0, -6],
             [1, 1835, 960, 129, 0, 0, -6],
             [963, 1835, 960, 129, 0, 0, -6],
             [1, 1, 960, 129, 1, 0, -6],
             [963, 1, 960, 129, 1, 0, -6],
             [1, 132, 960, 129, 1, 0, -6],
             [963, 132, 960, 129, 1, 0, -6],
             [1, 263, 960, 129, 1, 0, -6],
             [963, 263, 960, 129, 1, 0, -6],
             [1, 394, 960, 129, 1, 0, -6],
             [963, 394, 960, 129, 1, 0, -6],
             [1, 525, 960, 129, 1, 0, -6],
             [963, 525, 960, 129, 1, 0, -6],
             [1, 656, 960, 129, 1, 0, -6],
             [963, 656, 960, 129, 1, 0, -6],
             [1, 787, 960, 129, 1, 0, -6],
             [963, 787, 960, 129, 1, 0, -6],
             [1, 918, 960, 129, 1, 0, -6],
             [963, 918, 960, 129, 1, 0, -6],
             [1, 1049, 960, 129, 1, 0, -6],
             [963, 1049, 960, 129, 1, 0, -6],
             [1, 1180, 960, 129, 1, 0, -6],
             [963, 1180, 960, 129, 1, 0, -6],
             [1, 1311, 960, 129, 1, 0, -6],
             [963, 1311, 960, 129, 1, 0, -6],
             [1, 1442, 960, 129,
                1, 0, -6
             ],
             [963, 1442, 960, 129, 1, 0, -6],
             [1, 1573, 960, 129, 1, 0, -6],
             [963, 1573, 960, 129, 1, 0, -6],
             [1, 1704, 960, 129, 1, 0, -6],
             [963, 1704, 960, 129, 1, 0, -6],
             [1, 1835, 960, 129, 1, 0, -6],
             [963, 1835, 960, 129, 1, 0, -6],
             [1, 1, 960, 129, 2, 0, -6],
             [963, 1, 960, 129, 2, 0, -6],
             [1, 132, 960, 129, 2, 0, -6],
             [963, 132, 960, 129, 2, 0, -6],
             [1, 263, 960, 129, 2, 0, -6],
             [963, 263, 960, 129, 2, 0, -6],
             [1, 394, 960, 129, 2, 0, -6],
             [963, 394, 960, 129, 2, 0, -6],
             [1, 525, 960, 129, 2, 0, -6],
             [963, 525, 960, 129, 2, 0, -6],
             [1, 656, 960, 129, 2, 0, -6],
             [963, 656, 960, 129, 2, 0, -6],
             [1, 787, 960, 129, 2, 0, -6],
             [963, 787, 960,
                129, 2, 0, -6
             ],
             [1, 918, 960, 129, 2, 0, -6],
             [963, 918, 960, 129, 2, 0, -6],
             [1, 1049, 960, 129, 2, 0, -6],
             [963, 1049, 960, 129, 2, 0, -6],
             [1, 1180, 960, 129, 2, 0, -6],
             [963, 1180, 960, 129, 2, 0, -6],
             [1, 1311, 960, 129, 2, 0, -6],
             [963, 1311, 960, 129, 2, 0, -6],
             [1, 1442, 960, 129, 2, 0, -6],
             [963, 1442, 960, 129, 2, 0, -6],
             [1, 1573, 960, 129, 2, 0, -6],
             [963, 1573, 960, 129, 2, 0, -6],
             [1, 1704, 960, 129, 2, 0, -6],
             [963, 1704, 960, 129, 2, 0, -6],
             [1, 1835, 960, 129, 2, 0, -6],
             [963, 1835, 960, 129, 2, 0, -6],
             [1, 1, 960, 129, 3, 0, -6],
             [963, 1, 960, 129, 3, 0, -6],
             [1, 132, 960, 129, 3, 0, -6],
             [963, 132, 960, 129, 3, 0, -6],
             [1, 263, 960, 129, 3, 0, -6],
             [963, 263, 960, 129, 3, 0, -6],
             [1, 394, 960, 129, 3, 0, -6],
             [963, 394, 960, 129, 3, 0, -6],
             [1, 525, 960, 129, 3, 0, -6],
             [963, 525, 960, 129, 3, 0, -6],
             [1, 656, 960, 129, 3, 0, -6],
             [963, 656, 960, 129, 3, 0, -6],
             [1, 787, 960, 129, 3, 0, -6],
             [963, 787, 960, 129, 3, 0, -6],
             [1, 918, 960, 129, 3, 0, -6],
             [963, 918, 960, 129, 3, 0, -6],
             [1, 1049, 960, 129, 3, 0, -6],
             [963, 1049, 960, 129, 3, 0, -6],
             [1, 1180, 960, 129, 3, 0, -6],
             [963, 1180, 960, 129, 3, 0, -6],
             [1, 1311, 960, 129, 3, 0, -6],
             [963, 1311, 960, 129, 3, 0, -6],
             [1, 1442, 960, 129, 3, 0, -6],
             [963, 1442, 960, 129, 3, 0, -6],
             [1, 1573, 960, 129,
                3, 0, -6
             ],
             [963, 1573, 960, 129, 3, 0, -6],
             [1, 1704, 960, 129, 3, 0, -6],
             [963, 1704, 960, 129, 3, 0, -6],
             [1, 1835, 960, 129, 3, 0, -6],
             [963, 1835, 960, 129, 3, 0, -6],
             [1, 1, 960, 129, 4, 0, -6],
             [963, 1, 960, 129, 4, 0, -6],
             [1, 132, 960, 129, 4, 0, -6],
             [963, 132, 960, 129, 4, 0, -6],
             [1, 263, 960, 129, 4, 0, -6],
             [963, 263, 960, 129, 4, 0, -6],
             [1, 394, 960, 129, 4, 0, -6],
             [963, 394, 960, 129, 4, 0, -6],
             [1, 525, 960, 129, 4, 0, -6],
             [963, 525, 960, 129, 4, 0, -6],
             [1, 656, 960, 129, 4, 0, -6],
             [963, 656, 960, 129, 4, 0, -6],
             [1, 787, 960, 129, 4, 0, -6],
             [963, 787, 960, 129, 4, 0, -6],
             [1, 918, 960, 129, 4, 0, -6],
             [963, 918, 960,
                129, 4, 0, -6
             ],
             [1, 1049, 960, 129, 4, 0, -6],
             [963, 1049, 960, 129, 4, 0, -6]
          ],
          animations: {
             start: 0,
             anim: [0, 137]
          }
       });
       f = createSprite(p, "start");
       f.y = 1205;
       f.scale = 2;
       u.addChild(f);
       this.reset()
    };
    this.reset = function() {
       b = -250;
       c = -150;
       createjs.Tween.removeTweens(u);
       createjs.Tween.removeTweens(k);
       u.y = b;
       k.y = 1296;
       k.rotation = -4;
       f.gotoAndStop("start");
       d = [{
          x: 60,
          y: 400
       }, {
          x: 140,
          y: 420
       }, {
          x: 200,
          y: 400
       }, {
          x: 260,
          y: 420
       }, {
          x: 320,
          y: 400
       }, {
          x: 360,
          y: 400
       }];
       e = [{
          x: 100,
          y: 500
       }, {
          x: 140,
          y: 500
       }, {
          x: 140,
          y: 500
       }, {
          x: 200,
          y: 500
       }, {
          x: 260,
          y: 500
       }];
       g = [{
          x: 58,
          y: 327,
          left: !0,
          final_x: 8,
          final_y: 520,
          time_fall: 800
       }, {
          x: 116,
          y: 360,
          left: !0,
          final_x: 58,
          final_y: 520,
          time_fall: 800
       }, {
          x: 327,
          y: 410,
          left: !1,
          final_x: 377,
          final_y: 520,
          time_fall: 500
       }, {
          x: 170,
          y: 400,
          left: !0,
          final_x: 150,
          final_y: 520,
          time_fall: 800
       }, {
          x: 170,
          y: 400,
          left: !1,
          final_x: 220,
          final_y: 520,
          time_fall: 800
       }, {
          x: 250,
          y: 400,
          left: !1,
          final_x: 300,
          final_y: 520,
          time_fall: 800
       }, {
          x: 250,
          y: 400,
          left: !0,
          final_x: 200,
          final_y: 520,
          time_fall: 800
       }];
       d = shuffle(d);
       e = shuffle(e);
       g = shuffle(g);
       l = [];
       h = []
    };
    this.startBonus = function() {
       f.gotoAndPlay("anim");
       u.on("click", function() {});
       createjs.Tween.get(u, {
          loop: -1
       }).to({
          y: c
       }, 5500, createjs.Ease.sineInOut).to({
          y: b
       }, 5500, createjs.Ease.sineInOut);
       createjs.Tween.get(k, {
          loop: -1
       }).to({
          rotation: 4
       }, 8E3, createjs.Ease.sineInOut).to({
          rotation: -4
       }, 8E3, createjs.Ease.sineInOut)
    };
    this.endBonus = function() {
       u.off("click", function() {});
       for (var p = 0; p < l.length; p++) l[p].unload();
       for (p = 0; p < h.length; p++) h[p].stop();
       this.reset()
    };
    this.hitShip = function(p) {
       var t = d.pop(),
          B = new CHitShipEffect(t.x, t.y, k);
       l.push(B);
       new CScoreText("+" + p, t.x, t.y - 150, k);
       .5 < Math.random() && setTimeout(function() {
          var A = g.pop();
          new CJumpingEnemy(A, k)
       }, 1500)
    };
    this.missShip = function() {
       var p = e.pop();
       new CMissShipEffect(p.x, p.y, !0, k);
       new CScoreText(TEXT_MISS, p.x, p.y - 150, k)
    };
    this._init()
 }
 
 function CScoreText(a, b, c, d) {
    var e;
    this._init = function(g, l, h) {
       e = new createjs.Text("00000", "100px " + FONT_GAME_1, "#dab977");
       e.textAlign = "center";
       e.text = g;
       e.x = l;
       e.y = h;
       e.alpha = 0;
       e.shadow = new createjs.Shadow("#000", 2, 2, 2);
       d.addChild(e);
       var f = this;
       createjs.Tween.get(e).to({
          alpha: 1
       }, 200, createjs.Ease.quadIn).call(function() {
          f.moveUp()
       })
    };
    this.moveUp = function() {
       var g = e.y - 400,
          l = this;
       createjs.Tween.get(e).to({
          y: g
       }, 1500, createjs.Ease.sineIn).call(function() {
          l.unload()
       });
       createjs.Tween.get(e).wait(800).to({
          alpha: 0
       }, 500)
    };
    this.unload = function() {
       d.removeChild(e)
    };
    this._init(a, b, c)
 }
 
 function CFreespinPanel(a) {
    var b, c, d, e;
    this._init = function() {
       e = new createjs.Container;
       e.on("click", function() {});
       e.visible = !1;
       a.addChild(e);
       b = new createjs.Shape;
       b.graphics.beginFill("black").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       e.addChild(b);
       var g = s_oSpriteLibrary.getSprite("msg_box_small");
       d = new createjs.Container;
       d.x = CANVAS_WIDTH / 2;
       d.y = CANVAS_HEIGHT / 2;
       d.regX = g.width / 2;
       d.regY = g.height / 2;
       e.addChild(d);
       var l = createBitmap(g);
       d.addChild(l);
       c = new CTLText(d, 50, 40, g.width - 100, 400, 60, "center", "#dab977", FONT_GAME_1, 1, 0,
          0, TEXT_CONGRATS, !0, !0, !0, !1)
    };
    this.show = function(g) {
       c.refreshText(TEXT_CONGRATS + "\n\n" + TEXT_YOU_WIN + " " + g + " " + TEXT_FREESPINS);
       e.visible = !0;
       d.scale = 0;
       b.alpha = 0;
       var l = this;
       createjs.Tween.get(b).to({
          alpha: .7
       }, 300, createjs.Ease.quartOut);
       createjs.Tween.get(d).to({
          scale: 1
       }, 1E3, createjs.Ease.elasticOut).call(function() {
          setTimeout(function() {
             l.hide()
          }, 3E3)
       });
       playSound("start_bonus", 1, !1)
    };
    this.hide = function() {
       createjs.Tween.get(b).to({
          alpha: 0
       }, 500, createjs.Ease.quartOut);
       createjs.Tween.get(d).to({
          scale: 0
       }, 500, createjs.Ease.backIn).call(function() {
          s_oGame.exitFromFreespinPanel()
       })
    };
    this._init()
 }
 
 function CAvatarController(a) {
    var b, c, d;
    this._init = function() {
       d = new createjs.Container;
       a.addChild(d);
       b = new CAvatarPortrait(10, CANVAS_HEIGHT - 20, s_oAvatarSpritesheet, d);
       c = new CAvatarLandscape(150, CANVAS_HEIGHT + 80, s_oAvatarSpritesheet, d)
    };
    this.show = function(e) {
       c.show(e);
       b.show(e)
    };
    this.refreshPos = function(e) {
       s_bLandscape ? (c.setVisible(!0), b.setVisible(!1)) : (c.setVisible(!1), b.setVisible(!0));
       c.refreshPos(e);
       b.refreshPos()
    };
    this.startFreespin = function() {
       b.startFreespin();
       c.startFreespin()
    };
    this.hideFreespin = function() {
       b.hideFreespin();
       c.hideFreespin()
    };
    this._init()
 }
 
 function CAvatarLandscape(a, b, c, d) {
    var e, g, l, h;
    this._init = function(k, u, p) {
       e = k;
       g = u;
       h = new createjs.Container;
       h.x = e;
       h.y = g;
       f.addChild(h);
       l = createSprite(p, "start");
       l.on("animationend", this._onAnimationEnd, this);
       h.addChild(l)
    };
    this._hideAllAnims = function() {};
    this.refreshPos = function(k) {
       h.x = e + s_iOffsetX;
       h.y = k;
       h.scale = 1.43 * REEL_SCALE
    };
    this.show = function(k) {
       s_bLandscape && "start_freespin" === k && playSound("avatar_start_freespins", 1, !1);
       l.gotoAndPlay(k)
    };
    this.setVisible = function(k) {
       h.visible = k
    };
    this._onAnimationEnd = function(k) {};
    this.startFreespin = function() {
       l.framerate = 30
    };
    this.hideFreespin = function() {
       l.framerate = 40
    };
    var f = d;
    this._init(a, b, c)
 }
 
 function CAvatarPortrait(a, b, c, d) {
    var e, g, l, h, f, k;
    this._init = function(p, t, B) {
       e = p;
       g = t;
       k = new createjs.Container;
       k.x = p;
       k.y = t;
       u.addChild(k);
       p = createBitmap(s_oSpriteLibrary.getSprite("bg_avatar_portrait"));
       p.x = 95;
       p.y = 124;
       k.addChild(p);
       l = createBitmap(s_oSpriteLibrary.getSprite("bg_avatar_portrait_freespin"));
       l.alpha = 0;
       l.x = 95;
       l.y = 124;
       k.addChild(l);
       p = [];
       for (t = 0; 17 > t; t++) p.push(s_oSpriteLibrary.getSprite("win_frame_anim_big_" + t));
       p = new createjs.SpriteSheet({
          images: p,
          framerate: FPS,
          frames: {
             width: WIN_BIG_ANIM_WIDTH,
             height: WIN_BIG_ANIM_HEIGHT
          },
          animations: {
             "static": 0,
             anim: [0, 64]
          }
       });
       f = createSprite(p, "static", 0, 0, WIN_BIG_ANIM_WIDTH, WIN_BIG_ANIM_HEIGHT);
       k.addChild(f);
       h = createSprite(B, "start");
       h.scale = 2.4;
       h.x = WIN_BIG_ANIM_WIDTH / 2;
       h.y = 1.5 * WIN_BIG_ANIM_HEIGHT;
       h.on("animationend", this._onAnimationEnd, this);
       k.addChild(h);
       k.regY = WIN_BIG_ANIM_HEIGHT;
       B = new createjs.Shape;
       B.graphics.beginFill("rgba(0,0,0,0.01)").drawRect(-WIN_BIG_ANIM_HEIGHT, -
          WIN_BIG_ANIM_WIDTH, 3 * WIN_BIG_ANIM_WIDTH, WIN_BIG_ANIM_HEIGHT + 542);
       k.addChild(B);
       h.mask = B
    };
    this._hideAllAnims = function() {};
    this.refreshPos = function() {
       k.x = e + s_iOffsetX;
       k.y = g - s_iOffsetY;
       k.scale = REEL_SCALE;
       .72 < k.scale && (k.scale = .72)
    };
    this.show = function(p) {
       s_bLandscape || "start_freespin" !== p || playSound("avatar_start_freespins", 1, !1);
       h.gotoAndPlay(p)
    };
    this.startFreespin = function() {
       h.framerate = 30;
       createjs.Tween.get(l).to({
          alpha: 1
       }, 1500, createjs.Ease.cubicOut)
    };
    this.hideFreespin = function() {
       h.framerate = 40;
       createjs.Tween.get(l).to({
          alpha: 0
       }, 1500, createjs.Ease.cubicOut)
    };
    this.setVisible = function(p) {
       k.visible = p
    };
    this._onAnimationEnd = function(p) {};
    var u = d;
    this._init(a, b, c)
 }
 
 function CResultFreespin(a) {
    var b, c, d, e, g, l;
    this._init = function() {
       l = new createjs.Container;
       l.visible = !1;
       h.addChild(l);
       b = new createjs.Shape;
       b.graphics.beginFill("black").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       e = b.on("click", function() {});
       l.addChild(b);
       var f = s_oSpriteLibrary.getSprite("msg_box_win");
       d = new createjs.Container;
       d.x = CANVAS_WIDTH / 2;
       d.y = CANVAS_HEIGHT / 2;
       d.regX = f.width / 2;
       d.regY = f.height / 2;
       l.addChild(d);
       var k = createBitmap(f);
       d.addChild(k);
       c = new CTLText(d, 120, 210, f.width - 240, 400, 70, "center", "#dab977", FONT_GAME_1, 1,
          0, 0, TEXT_CONGRATS, !0, !0, !0, !1);
       c.setShadow("#000", 4, 4, 2);
       g = new CGfxButton(f.width / 2, f.height - 120, s_oSpriteLibrary.getSprite("but_yes"), d);
       g.addEventListener(ON_MOUSE_UP, this.hide, this)
    };
    this.unload = function() {
       g.unload();
       b.off("click", e)
    };
    this.show = function(f) {
       g.enable();
       0 === f ? (c.y = 0, c.refreshText(TEXT_NO_WIN), playSound("bonus_notify_lose", 1, !1)) : (
          c.y = 30, c.refreshText(TEXT_CONGRATS + "\n\n" + TEXT_YOU_WON + " " + formatEntries(
             f)), this._showAvatar(), playSound("end_bonus", 1, !1));
       l.alpha = 1;
       l.visible = !0;
       d.scale = 0;
       b.alpha = 0;
       var k = this;
       createjs.Tween.get(b).to({
          alpha: .7
       }, 300, createjs.Ease.quartOut);
       createjs.Tween.get(d).to({
          scale: 1
       }, 1E3, createjs.Ease.bounceOut).call(function() {
          setTimeout(function() {
             k.hide()
          }, 3E3)
       })
    };
    this.hide = function() {
       g.disable();
       createjs.Tween.get(b).to({
          alpha: 0
       }, 500, createjs.Ease.quartOut);
       createjs.Tween.get(d).to({
          scale: 0
       }, 500, createjs.Ease.backIn).call(function() {
          l.visible = !1
       })
    };
    this._showAvatar = function() {};
    var h = a;
    this._init()
 }
 var MS_ROLLING_SCORE = 2500;
 
 function CRollingScore() {
    var a = null,
       b = null;
    this.rolling = function(c, d, e) {
       a = createjs.Tween.get(c, {
          override: !0
       }).to({
          text: e
       }, MS_ROLLING_SCORE, createjs.Ease.linear).addEventListener("change", function() {
          c.text = formatEntries(c.text);
          playSound("score_counter", .5, !1)
       }).call(function() {
          createjs.Tween.removeTweens(a)
       });
       null !== d && (b = createjs.Tween.get(d, {
          override: !0
       }).to({
          text: e
       }, MS_ROLLING_SCORE, createjs.Ease.linear).addEventListener("change", function() {
          d.text = formatEntries(d.text)
       }).call(function() {
          createjs.Tween.removeTweens(b)
       }))
    };
    return this
 }
 
 function CRechargePanel() {
    var a, b, c, d, e, g, l, h = this;
    this._init = function() {
       l = new createjs.Container;
       s_oStage.addChild(l);
       b = new createjs.Shape;
       a = b.on("click", function() {});
       b.alpha = 0;
       b.graphics.beginFill("black").drawRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       l.addChild(b);
       var f = s_oSpriteLibrary.getSprite("msg_box_small");
       c = new createjs.Container;
       c.x = CANVAS_WIDTH / 2;
       c.y = CANVAS_HEIGHT / 2;
       c.regX = .5 * f.width;
       c.regY = .5 * f.height;
       l.addChild(c);
       g = createBitmap(f);
       c.addChild(g);
       new CTLText(c, 50, 60, f.width - 100, 180, 90, "center", "#dab977", FONT_GAME_1, 1, 40, 10,
          TEXT_RECHARGE, !0, !0, !0, !1);
       var k = s_oSpriteLibrary.getSprite("but_no");
       e = new CGfxButton(130, 380, k, c);
       e.addEventListener(ON_MOUSE_UP, this.hide, this);
       d = new CGfxButton(f.width - 130, 380, s_oSpriteLibrary.getSprite("but_yes"), c);
       d.addEventListener(ON_MOUSE_UP, this._onRecharge, this);
       this.disableButtons();
       l.visible = !0;
       c.scale = 0;
       b.alpha = 0;
       createjs.Tween.get(b).to({
          alpha: .7
       }, 300, createjs.Ease.quartOut);
       createjs.Tween.get(c).to({
          scale: 1
       }, 1E3, createjs.Ease.elasticOut).call(function() {
          h.enableButtons()
       })
    };
    this.unload = function() {
       e.unload();
       d.unload();
       b.off("click", a);
       s_oStage.removeChild(l)
    };
    this.disableButtons = function() {
       d.disable();
       e.disable()
    };
    this.enableButtons = function() {
       e.enable();
       d.enable()
    };
    this.hide = function() {
       var f = this;
       createjs.Tween.get(b).to({
          alpha: 0
       }, 500, createjs.Ease.quartOut);
       createjs.Tween.get(c).to({
          scale: 0
       }, 500, createjs.Ease.backIn).call(function() {
          f.unload()
       })
    };
    this._onRecharge = function() {
       h.hide();
       $(s_oMain).trigger("recharge")
    };
    this._init()
 }
 
 function CSuspanceEffect(a) {
    var b, c;
    this._init = function() {
       c = new createjs.Container;
       c.visible = !1;
       a.addChild(c);
       for (var d = [], e = 0; 6 > e; e++) d.push(s_oSpriteLibrary.getSprite("suspance_reel_" + e));
       d = new createjs.SpriteSheet({
          images: d,
          framerate: 40,
          frames: [
             [1, 1, 364, 719, 0, -27, -23],
             [367, 1, 382, 714, 0, -18, -23],
             [751, 1, 392, 711, 0, -13, -22],
             [1145, 1, 393, 712, 0, -13, -21],
             [1540, 1, 396, 712, 0, -11, -21],
             [1, 722, 394, 712, 0, -12, -21],
             [397, 722, 387, 714, 0, -15, -20],
             [786, 722, 376, 723, 0, -21, -20],
             [1164, 722, 369, 734, 0, -25, -20],
             [1535, 722, 360,
                731, 0, -28, -19
             ],
             [1, 1, 353, 735, 1, -31, -19],
             [356, 1, 365, 730, 1, -26, -19],
             [723, 1, 365, 728, 1, -26, -18],
             [1090, 1, 358, 718, 1, -29, -18],
             [1450, 1, 357, 718, 1, -30, -18],
             [1, 738, 357, 720, 1, -30, -17],
             [360, 738, 362, 728, 1, -28, -17],
             [724, 738, 364, 730, 1, -27, -17],
             [1090, 738, 362, 722, 1, -28, -16],
             [1454, 738, 360, 722, 1, -29, -16],
             [1, 1, 400, 724, 2, -9, -15],
             [403, 1, 389, 724, 2, -12, -15],
             [794, 1, 366, 724, 2, -29, -15],
             [1162, 1, 341, 725, 2, -39, -14],
             [1505, 1, 338, 733, 2, -40, -7],
             [1, 736, 332, 734, 2, -42, -6],
             [335, 736, 327, 726, 2, -47, -14],
             [664, 736, 346, 737, 2, -31, -13],
             [1012, 736,
                360, 729, 2, -29, -13
             ],
             [1374, 736, 360, 729, 2, -29, -13],
             [1, 1, 363, 728, 3, -28, -13],
             [366, 1, 365, 728, 3, -26, -13],
             [733, 1, 364, 726, 3, -27, -14],
             [1099, 1, 375, 726, 3, -22, -14],
             [1476, 1, 376, 726, 3, -21, -14],
             [1, 731, 376, 724, 3, -21, -15],
             [379, 731, 373, 725, 3, -22, -14],
             [754, 731, 372, 736, 3, -23, -15],
             [1128, 731, 375, 738, 3, -21, -16],
             [1505, 731, 380, 731, 3, -19, -16],
             [1, 1, 380, 738, 4, -19, -16],
             [383, 1, 372, 735, 4, -23, -17],
             [757, 1, 372, 741, 4, -23, -10],
             [1131, 1, 367, 720, 4, -26, -17],
             [1500, 1, 363, 719, 4, -27, -17],
             [1, 744, 358, 719, 4, -30, -17],
             [361, 744, 360, 716, 4, -30, -19],
             [723, 744, 362, 716, 4, -28, -19],
             [1087, 744, 360, 724, 4, -29, -19],
             [1449, 744, 355, 728, 4, -31, -20],
             [1, 1, 363, 738, 5, -27, -16],
             [366, 1, 364, 741, 5, -27, -13],
             [732, 1, 358, 743, 5, -29, -11],
             [1092, 1, 362, 744, 5, -28, -10],
             [1456, 1, 366, 741, 5, -26, -10],
             [1, 747, 365, 733, 5, -26, -9],
             [368, 747, 364, 724, 5, -27, -23]
          ],
          animations: {
             start: 0,
             anim: [0, 56]
          }
       });
       b = createSprite(d, "start");
       c.addChild(b)
    };
    this.show = function(d, e) {
       c.visible = !0;
       c.alpha = 0;
       c.x = d;
       c.y = e;
       b.gotoAndPlay("anim");
       createjs.Tween.get(c).to({
          alpha: 1
       }, 500, createjs.Ease.cubicOut);
       playSound("suspance", 1, !0)
    };
    this.hide = function() {
       c.visible = !1;
       b.gotoAndStop("start");
       stopSound("suspance")
    };
    this._init()
 }
 
 function CBgController(a) {
    var b, c, d, e;
    this._init = function() {
       e = new createjs.Container;
       e.y = -250;
       a.addChild(e);
       b = createBitmap(s_oSpriteLibrary.getSprite("bg_game"));
       e.addChild(b);
       c = createBitmap(s_oSpriteLibrary.getSprite("bg_freespin"));
       c.alpha = 0;
       e.addChild(c);
       var g = createBitmap(s_oSpriteLibrary.getSprite("bg_ship_0"));
       a.addChild(g);
       g = createBitmap(s_oSpriteLibrary.getSprite("bg_ship_1"));
       g.y = 750;
       a.addChild(g);
       d = createBitmap(s_oSpriteLibrary.getSprite("bg_ship_freespin"));
       d.alpha = 0;
       a.addChild(d);
       createjs.Tween.get(e, {
          loop: -1
       }).to({
          y: 0
       }, 5500, createjs.Ease.sineInOut).to({
          y: -250
       }, 5500, createjs.Ease.sineInOut)
    };
    this.startFreespin = function() {
       createjs.Tween.get(c).to({
          alpha: 1
       }, 1500, createjs.Ease.cubicOut);
       createjs.Tween.get(d).to({
          alpha: 1
       }, 1500, createjs.Ease.cubicOut)
    };
    this.stopFreespin = function() {
       createjs.Tween.get(c).to({
          alpha: 0
       }, 1500, createjs.Ease.cubicOut);
       createjs.Tween.get(d).to({
          alpha: 0
       }, 1500, createjs.Ease.cubicOut)
    };
    this._init()
 }
 
 function CGuiBase(a) {
    this._oInfoBut;
    this._oBetCoinBut;
    this._oAddLineBut;
    this._oAutoSpinBut;
    this._oSpinBut;
    this._oContainer;
    this._oParentContainer = a
 }
 CGuiBase.prototype._init = function(a) {};
 CGuiBase.prototype.unload = function() {
    this._oInfoBut.unload();
    this._oBetCoinBut.unload();
    this._oAddLineBut.unload();
    this._oAutoSpinBut.unload();
    this._oSpinBut.unload()
 };
 CGuiBase.prototype.setVisible = function(a) {
    this._oContainer.visible = a
 };
 CGuiBase.prototype.enableGuiButtons = function() {
    this._oSpinBut.enable();
    this._oAutoSpinBut.enable();
    this._oBetCoinBut.enable();
    this._oAddLineBut.enable();
    this._oInfoBut.enable();
    s_bMobile || (document.onkeyup = this.onKeyUp)
 };
 CGuiBase.prototype.enableSpin = function(a) {
    this._oSpinBut.enable();
    a && this._oAutoSpinBut.enable();
    s_bMobile || (document.onkeyup = this.onKeyUp)
 };
 CGuiBase.prototype.disableSpin = function(a) {
    this._oSpinBut.disable();
    a && this._oAutoSpinBut.disable();
    s_bMobile || (document.onkeyup = null)
 };
 CGuiBase.prototype.disableGuiButtons = function(a, b) {
    s_bMobile || (document.onkeyup = null);
    b ? (this._oAutoSpinBut.disable(), this.disableSpin(!0)) : a ? (this._oSpinBut.disable(),
       this._oAutoSpinBut.setText(TEXT_STOP_AUTO)) : (this._oAutoSpinBut.disable(), this._oSpinBut
       .setText(TEXT_SKIP));
    this._oBetCoinBut.disable();
    this._oAddLineBut.disable();
    this._oInfoBut.disable()
 };
 CGuiBase.prototype.setAutoSpinState = function(a) {
    this._oAutoSpinBut.setText(a)
 };
 CGuiBase.prototype.setSpinState = function(a) {
    this._oSpinBut.setText(a)
 };
 CGuiBase.prototype.setSpinText = function(a) {
    this._oSpinBut.setText(a)
 };
 CGuiBase.prototype.setAutoSpinText = function(a) {
    this._oAutoSpinBut.setText(a)
 };
 CGuiBase.prototype.setLineText = function(a) {
    this._oAddLineBut.setText(a)
 };
 CGuiBase.prototype.setBetText = function(a) {
    this._oBetCoinBut.setText(a)
 };
 
 function CGuiPortrait(a, b) {
    this._pStartPos;
    CGuiBase.call(this, b);
    this._init(a)
 }
 CGuiPortrait.prototype = Object.create(CGuiBase.prototype);
 CGuiPortrait.prototype._init = function(a) {
    var b = s_oSpriteLibrary.getSprite("but_text_big"),
       c = s_oSpriteLibrary.getSprite("but_text");
    this._pStartPos = {
       x: CANVAS_WIDTH + c.width / 4 - 20,
       y: CANVAS_HEIGHT - c.height / 2
    };
    this._oContainer = new createjs.Container;
    this._oContainer.x = this._pStartPos.x;
    this._oContainer.y = this._pStartPos.y;
    this._oParentContainer.addChild(this._oContainer);
    var d = 0;
    this._oInfoBut = new CSpriteSheetTextButton(0, d, c, TEXT_PAYTABLE, FONT_GAME_1, "#fff", 34,
       this._oContainer);
    this._oInfoBut.addEventListener(ON_MOUSE_UP, s_oInterface._onInfo, s_oInterface);
    this._oBetCoinBut = new CSpriteSheetTextButton(c.width / 2 + 20, d, c, TEXT_COIN + " " +
       formatEntries(a), FONT_GAME_1, "#fff", 34, this._oContainer);
    this._oBetCoinBut.addEventListener(ON_MOUSE_UP, s_oInterface._onBet, s_oInterface);
    d += c.height + 20;
    this._oAddLineBut = new CSpriteSheetTextButton(0, d, c, TEXT_LINES + " " + NUM_PAYLINES,
       FONT_GAME_1, "#fff", 34, this._oContainer);
    this._oAddLineBut.addEventListener(ON_MOUSE_UP, s_oInterface._onAddLine, s_oInterface);
    this._oAutoSpinBut = new CSpriteSheetTextButton(c.width / 2 + 20, d, c, TEXT_AUTO_SPIN,
       FONT_GAME_1, "#fff", 34, this._oContainer);
    this._oAutoSpinBut.addEventListener(ON_MOUSE_UP, s_oInterface._onAutoSpin, s_oInterface);
    d += 2 * c.height + 20;
    this._oSpinBut = new CSpriteSheetTextButton(c.width / 4, d, b, TEXT_SPIN, FONT_GAME_1, "#fff",
       68, this._oContainer);
    this._oSpinBut.addEventListener(ON_MOUSE_UP, s_oInterface._onSpin, s_oInterface);
    this._oContainer.regX = this._oContainer.getBounds().width;
    this._oContainer.regY = this._oContainer.getBounds().height
 };
 CGuiPortrait.prototype.refreshPos = function() {
    this._oContainer.x = this._pStartPos.x - s_iOffsetX;
    this._oContainer.y = this._pStartPos.y - s_iOffsetY;
    this._oContainer.scale = REEL_SCALE;
    .9 > this._oContainer.scale && (this._oContainer.scale = .9)
 };
 
 function CGuiLandscape(a, b) {
    CGuiBase.call(this, b);
    this._init(a)
 }
 CGuiLandscape.prototype = Object.create(CGuiBase.prototype);
 CGuiLandscape.prototype._init = function(a) {
    this._oContainer = new createjs.Container;
    this._oParentContainer.addChild(this._oContainer);
    var b = s_oSpriteLibrary.getSprite("but_text");
    this._oInfoBut = new CSpriteSheetTextButton(364, 894, b, TEXT_PAYTABLE, FONT_GAME_1, "#fff",
       34, this._oContainer);
    this._oInfoBut.addEventListener(ON_MOUSE_UP, s_oInterface._onInfo, s_oInterface);
    this._oBetCoinBut = new CSpriteSheetTextButton(612, 894, b, TEXT_COIN + " " + formatEntries(a),
       FONT_GAME_1, "#fff", 34, this._oContainer);
    this._oBetCoinBut.addEventListener(ON_MOUSE_UP, s_oInterface._onBet, s_oInterface);
    this._oAddLineBut = new CSpriteSheetTextButton(859, 894, b, TEXT_LINES + " " + NUM_PAYLINES,
       FONT_GAME_1, "#fff", 34, this._oContainer);
    this._oAddLineBut.addEventListener(ON_MOUSE_UP, s_oInterface._onAddLine, s_oInterface);
    this._oAutoSpinBut = new CSpriteSheetTextButton(1106, 894, b, TEXT_AUTO_SPIN, FONT_GAME_1,
       "#fff", 34, this._oContainer);
    this._oAutoSpinBut.addEventListener(ON_MOUSE_UP, s_oInterface._onAutoSpin, s_oInterface);
    this._oSpinBut = new CSpriteSheetTextButton(1354, 894, b, TEXT_SPIN, FONT_GAME_1, "#fff", 34,
       this._oContainer);
    this._oSpinBut.addEventListener(ON_MOUSE_UP, s_oInterface._onSpin, s_oInterface)
 };
 
 function CHitShipEffect(a, b, c) {
    var d, e;
    this._init = function(g, l) {
       e = new createjs.Container;
       e.x = g;
       e.y = l;
       c.addChild(e);
       var h = {
          images: [s_oSpriteLibrary.getSprite("enemy_ship_hit")],
          framerate: 40,
          frames: [
             [1, 1, 25, 27, 0, -29, -39],
             [28, 1, 38, 40, 0, -22, -34],
             [68, 1, 44, 45, 0, -18, -32],
             [114, 1, 49, 50, 0, -16, -30],
             [165, 1, 50, 53, 0, -16, -28],
             [1, 56, 51, 55, 0, -16, -27],
             [54, 56, 52, 55, 0, -16, -27],
             [108, 56, 54, 57, 0, -16, -26],
             [164, 56, 58, 59, 0, -16, -25],
             [1, 117, 62, 60, 0, -16, -25],
             [65, 117, 69, 63, 0, -16, -23],
             [136, 117, 73, 64, 0, -15, -23],
             [1, 183, 75, 66, 0, -13, -22],
             [78, 183, 75, 66, 0, -13, -22],
             [155, 183, 76, 68, 0, -13, -21],
             [1, 253, 76, 69, 0, -13, -20],
             [79, 253, 76, 70, 0, -13, -19],
             [157, 253, 75, 71, 0, -14, -18],
             [1, 326, 75, 70, 0, -14, -18],
             [78, 326, 75, 72, 0, -14, -17],
             [155, 326, 74, 72, 0, -15, -17],
             [1, 400, 74, 73, 0, -15, -16],
             [77, 400, 74, 75, 0, -15, -15],
             [153, 400, 73, 74, 0, -16, -15],
             [1, 477, 73, 74, 0, -16, -14],
             [76, 477, 64, 72, 0, -16, -14],
             [142, 477, 65, 72, 0, -16, -13],
             [1, 553, 65, 72, 0, -16, -13],
             [68, 553, 66, 69, 0, -16, -13],
             [136, 553, 66, 69, 0, -16, -12],
             [1, 627, 67, 69, 0, -16, -11],
             [70, 627, 67, 68, 0, -16, -11],
             [139, 627, 68, 68, 0, -16, -10],
             [1, 698, 68, 66, 0, -16, -8],
             [71, 698, 68, 66, 0, -16, -8],
             [141, 698, 69, 66, 0, -16, -7],
             [1, 766, 70, 66, 0, -16, -6],
             [73, 766, 70, 67, 0, -17, -4],
             [145, 766, 71, 66, 0, -17, -4],
             [1, 835, 71, 64, 0, -17, -3],
             [74, 835, 72, 63, 0, -17, -2],
             [148, 835, 72, 60, 0, -17, -2],
             [1, 901, 71, 58, 0, -17, -2],
             [74, 901, 70, 54, 0, -17, -2],
             [146, 901, 51, 43, 0, -23, -10]
          ],
          animations: {
             idle: 0,
             anim: [0, 44, "end"],
             end: 45
          }
       };
       h = new createjs.SpriteSheet(h);
       var f = createSprite(h, "idle");
       e.addChild(f);
       h = {
          images: [s_oSpriteLibrary.getSprite("enemy_ship_fire")],
          framerate: 40,
          frames: [
             [1, 1, 43,
                72, 0, -27, -9
             ],
             [46, 1, 43, 64, 0, -27, -16],
             [91, 1, 42, 67, 0, -28, -13],
             [135, 1, 42, 66, 0, -28, -14],
             [179, 1, 42, 68, 0, -28, -11],
             [1, 75, 41, 69, 0, -28, -11],
             [44, 75, 43, 69, 0, -27, -11],
             [89, 75, 43, 65, 0, -27, -14],
             [134, 75, 43, 67, 0, -27, -12],
             [179, 75, 44, 67, 0, -26, -12],
             [1, 146, 45, 64, 0, -25, -15],
             [48, 146, 46, 65, 0, -24, -14],
             [96, 146, 46, 64, 0, -24, -15],
             [144, 146, 46, 64, 0, -23, -15],
             [1, 213, 45, 63, 0, -24, -16],
             [48, 213, 45, 66, 0, -24, -13],
             [95, 213, 45, 69, 0, -24, -10],
             [142, 213, 46, 71, 0, -23, -9],
             [190, 213, 45, 70, 0, -24, -11],
             [1, 286, 44, 68, 0, -25, -13],
             [47, 286, 44, 66, 0, -25, -14],
             [93, 286, 45, 64, 0, -24, -16],
             [140, 286, 44, 62, 0, -24, -18],
             [186, 286, 42, 65, 0, -26, -15],
             [1, 356, 43, 67, 0, -25, -13],
             [46, 356, 43, 62, 0, -25, -17],
             [91, 356, 43, 65, 0, -25, -14],
             [136, 356, 43, 69, 0, -26, -10],
             [181, 356, 42, 73, 0, -28, -6],
             [1, 431, 43, 74, 0, -27, -5],
             [46, 431, 44, 74, 0, -26, -5],
             [92, 431, 45, 65, 0, -25, -14],
             [139, 431, 46, 65, 0, -24, -14],
             [187, 431, 46, 63, 0, -24, -16]
          ],
          animations: {
             idle: 0,
             anim: [0, 33]
          }
       };
       h = new createjs.SpriteSheet(h);
       d = createSprite(h, "idle");
       d.alpha = 0;
       e.addChild(d);
       f.gotoAndPlay("anim");
       d.gotoAndPlay("anim");
       playSound("bonus_game_enemy_hit", 1, !1);
       createjs.Tween.get(d).wait(500).to({
          alpha: 1
       }, 300, createjs.Ease.quartOut).wait(500).call(function() {
          s_oBonusPanel.checkEndBonus()
       })
    };
    this.unload = function() {
       c.removeChild(e)
    };
    this._init(a, b)
 }
 
 function CMissShipEffect(a, b, c, d) {
    var e;
    this._init = function(g, l) {
       e = new createjs.Container;
       e.x = g;
       e.y = l;
       d.addChild(e);
       var h = {
          images: [s_oSpriteLibrary.getSprite("splash")],
          framerate: 35,
          frames: [
             [1, 1, 14, 10, 0, 8, 14],
             [17, 1, 29, 19, 0, 13, 22],
             [48, 1, 43, 23, 0, 24, 26],
             [1, 26, 62, 29, 0, 35, 32],
             [1, 57, 86, 35, 0, 49, 38],
             [1, 94, 100, 40, 0, 57, 43],
             [1, 136, 109, 46, 0, 58, 49],
             [1, 184, 116, 52, 0, 59, 55],
             [1, 238, 117, 57, 0, 59, 60],
             [1, 297, 117, 62, 0, 58, 65],
             [1, 361, 116, 66, 0, 58, 69],
             [1, 429, 117, 66, 0, 58, 69],
             [1, 497, 118, 67, 0, 59, 70],
             [1, 566, 117, 67, 0, 58, 70],
             [1,
                635, 118, 67, 0, 59, 70
             ],
             [1, 704, 118, 68, 0, 59, 71],
             [1, 774, 118, 69, 0, 59, 72],
             [1, 845, 118, 69, 0, 59, 72],
             [1, 916, 118, 68, 0, 59, 71],
             [1, 986, 118, 69, 0, 59, 72],
             [1, 1057, 118, 69, 0, 59, 72],
             [1, 1128, 118, 68, 0, 59, 72],
             [1, 1198, 118, 67, 0, 59, 71],
             [1, 1267, 118, 68, 0, 59, 71],
             [1, 1337, 118, 67, 0, 59, 70],
             [1, 1406, 118, 67, 0, 59, 71],
             [1, 1475, 118, 67, 0, 59, 71],
             [1, 1544, 118, 68, 0, 59, 72],
             [1, 1614, 118, 68, 0, 59, 72],
             [1, 1684, 117, 67, 0, 59, 71],
             [1, 1753, 115, 68, 0, 59, 72],
             [1, 1823, 34, 47, 0, -25, 75]
          ],
          animations: {
             idle: 0,
             anim: [0, 31, "end"],
             end: 31
          }
       };
       h = new createjs.SpriteSheet(h);
       h = createSprite(h, "anim");
       h.on("animationend", this._onAnimEnd, this);
       e.addChild(h);
       playSound("bonus_game_water_splash", 1, !1)
    };
    this._onAnimEnd = function(g) {
       "end" === g.name && (d.removeChild(e), c && s_oBonusPanel.checkEndBonus())
    };
    this._init(a, b)
 }
 
 function CJumpingEnemy(a, b) {
    var c;
    this._init = function(d) {
       c = new createjs.Container;
       b.addChild(c);
       var e = s_oSpriteLibrary.getSprite("enemy_pirate");
       e = createBitmap(e);
       e.x = d.x;
       e.y = d.y;
       d.left || (e.scaleX = -1);
       c.addChild(e);
       playSound("bonus_game_enemy_scream_" + (.5 < Math.random() ? "0" : "1"), 1, !1);
       createjs.Tween.get(e).to({
          x: d.final_x
       }, 1E3, createjs.Ease.linear);
       createjs.Tween.get(e).to({
          y: d.y - 50
       }, 300, createjs.Ease.cubicOut).to({
          y: d.final_y
       }, d.time_fall, createjs.Ease.cubicInOut).call(function() {
          new CMissShipEffect(d.final_x, d.final_y, !1, b);
          b.removeChild(c)
       })
    };
    this._init(a)
 }
 
 function extractHostname(a) {
    a = -1 < a.indexOf("://") ? a.split("/")[2] : a.split("/")[0];
    a = a.split(":")[0];
    return a = a.split("?")[0]
 }
 
 function extractRootDomain(a) {
    a = extractHostname(a);
    var b = a.split("."),
       c = b.length;
    2 < c && (a = b[c - 2] + "." + b[c - 1]);
    return a
 }
 var getClosestTop = function() {
   
       var a = window,
          b = !1;
       try {
          for (; a.parent.document !== a.document;)
             if (a.parent.document) a = a.parent;
             else {
                b = !0;
                break
             }
       } catch (c) {
          b = !0
       }
       return {
          topFrame: a,
          err: b
       }
    },
    getBestPageUrl = function(a) {
       var b = a.topFrame,
          c = "";
       if (a.err) try {
          try {
             c = window.top.location.href
          } catch (e) {
             var d = window.location.ancestorOrigins;
             c = d[d.length - 1]
          }
       } catch (e) {
          c = b.document.referrer
       } else c = b.location.href;
       return c
    },
    TOPFRAMEOBJ = getClosestTop(),
    PAGE_URL = getBestPageUrl(TOPFRAMEOBJ);
 
 function seekAndDestroy() {
    return !0
 };