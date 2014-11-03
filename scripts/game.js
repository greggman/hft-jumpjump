/*
 * Copyright 2014, Gregg Tavares.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Gregg Tavares. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

function $(id) {
  return document.getElementById(id);
}

// Start the main app logic.
requirejs(
  [ 'hft/gameserver',
    'hft/gamesupport',
    'hft/localnetplayer',
    'hft/misc/input',
    'hft/misc/misc',
    'hft/misc/strings',
    '../bower_components/tdl/tdl/textures',
    '../bower_components/tdl/tdl/webgl',
    '../bower_components/hft-utils/dist/audio',
    '../bower_components/hft-utils/dist/entitysystem',
    '../bower_components/hft-utils/dist/imageloader',
    '../bower_components/hft-utils/dist/imageutils',
    '../bower_components/hft-utils/dist/levelloader',
    '../bower_components/hft-utils/dist/spritemanager',
    './collectable',
    './level',
    './levelmanager',
    './particleeffectmanager',
    './particlesystemmanager',
    './playermanager',
    './scoremanager',
  ], function(
    GameServer,
    GameSupport,
    LocalNetPlayer,
    Input,
    Misc,
    Strings,
    Textures,
    WebGL,
    AudioManager,
    EntitySystem,
    ImageLoader,
    ImageUtils,
    LevelLoader,
    SpriteManager,
    Collectable,
    Level,
    LevelManager,
    ParticleEffectManager,
    ParticleSystemManager,
    PlayerManager,
    ScoreManager) {
  var g_debug = false;
  var g_services = {};
window.s = g_services;

  var g_entitySystem = new EntitySystem();
  g_services.entitySystem = g_entitySystem;
  var g_drawSystem = new EntitySystem('draw');
  g_services.drawSystem = g_drawSystem;
  var g_playerManager = new PlayerManager(g_services);
  g_services.playerManager = g_playerManager;
  g_services.misc = Misc;
  var g_scoreManager = new ScoreManager(g_services, $("score"));
  g_services.scoreManager = g_scoreManager;
  var stop = false;

  // You can set these from the URL with
  // http://path/gameview.html?settings={name:value,name:value}
  var globals = {
    haveServer: true,
    numLocalPlayers: 1,  // num players when local (ie, debugger)
    debug: false,
    tileInspector: false,
    showState: false,
    moveAcceleration: 500,
    maxVelocity: [200, 1000],
    jumpDuration: 0.2,        // how long the jump velocity can be applied
    jumpVelocity: -350,
    minStopVelocity: 25,      // below this we're idling
    stopFriction: 0.95,       // amount of velocity to keep each frame
    gravity: 1200,
    frameCount: 0,
    idleAnimSpeed: 4,
    moveAnimSpeed: 0.2,
    coinAnimSpeed: 10,
    jumpFirstFrameTime: 0.1,
    fallTopAnimVelocity: 100,
    drawOffset: {},
    scale: 1,
    levels: [
      { width: 10, height: 15, url: "assets/levels/level10x15.json", },
      { width: 20, height: 10, url: "assets/levels/level20x10.json", },
      { width: 30, height: 15, url: "assets/levels/level30x15.json", },
      { width: 40, height: 20, url: "assets/levels/level40x20.json", },
    ],
  };
window.g = globals;

  function startLocalPlayers() {
    var localPlayers = [];

    var addLocalPlayer = function() {
      var netPlayer = new LocalNetPlayer();
      localPlayers.push({
        player: g_playerManager.startPlayer(netPlayer, "Player" + (localPlayers.length + 1)),
        netPlayer: netPlayer,
        leftRight: 0,
        oldLeftRight: 0,
        jump: false,
      });
    };

    var removeLocalPlayer = function(playerId) {
      if (playerId < localPlayers.length) {
        localPlayers[playerId].netPlayer.sendEvent('disconnect');
        localPlayers.splice(playerId, 1);
      }
    };

    for (var ii = 0; ii < globals.numLocalPlayers; ++ii) {
      addLocalPlayer();
    }

    var handleLeftRight = function(playerId, pressed, bit) {
      var localPlayer = localPlayers[playerId];
      if (localPlayer) {
        localPlayer.leftRight = (localPlayer.leftRight & ~bit) | (pressed ? bit : 0);
        if (localPlayer.leftRight != localPlayer.oldLeftRight) {
          localPlayer.oldLeftRight = localPlayer.leftRight;
          localPlayer.netPlayer.sendEvent('move', {
              dir: (localPlayer.leftRight & 1) ? -1 : ((localPlayer.leftRight & 2) ? 1 : 0),
          });
        }
      }
    };

    var handleJump = function(playerId, pressed) {
      var localPlayer = localPlayers[playerId];
      if (localPlayer) {
        if (localPlayer.jump != pressed) {
          localPlayer.jump = pressed;
          localPlayer.netPlayer.sendEvent('jump', {
              jump: pressed,
          });
        }
      }
    };

    var handleTestSound = (function() {
      var soundNdx = 0;
      var soundIds;

      return function(pressed) {
        if (!soundIds) {
          soundIds = g_services.audioManager.getSoundIds();
        }
        if (pressed) {
          var id = soundIds[soundNdx];
          console.log("play: " + id);
          g_services.audioManager.playSound(id);
          soundNdx = (soundNdx + 1) % soundIds.length;
        }
      };
    }());

    var keys = { };
    keys[Input.cursorKeys.kLeft]  = function(e) { handleLeftRight(0, e.pressed, 0x1); }
    keys[Input.cursorKeys.kRight] = function(e) { handleLeftRight(0, e.pressed, 0x2); }
    keys["Z"]                     = function(e) { handleJump(0, e.pressed);           }
    keys["A"]                     = function(e) { handleLeftRight(1, e.pressed, 0x1); }
    keys["D"]                     = function(e) { handleLeftRight(1, e.pressed, 0x2); }
    keys["W"]                     = function(e) { handleJump(1, e.pressed);           }
    keys["X"]                     = function(e) { handleTestSound(e.pressed);         }
    keys[187]                     = function(e) { addLocalPlayer();                   }
    keys[189]                     = function(e) { removeLocalPlayer(2);               }
    Input.setupKeys(keys);
  }

  Misc.applyUrlSettings(globals);

  var canvas = $("playfield");
  var gl = WebGL.setupWebGL(canvas, {alpha:false}, function() {});
  g_services.spriteManager = new SpriteManager();
  g_services.particleSystemManager = new ParticleSystemManager(2);

  var chooseLevel = function(levels, maxWidth, maxHeight) {
    // pick the largest level that fits
    var largestLevel = levels[0];
    var largestSize = 0;
    levels.forEach(function(level) {
      var hSpace = maxWidth  - level.width  * 32;
      var vSpace = maxHeight - level.height * 32;
      if (hSpace >= 0 && vSpace >= 0) {
        var size = level.width * level.height;
        if (size > largestSize) {
          largestSize = size;
          largestLevel = level;
        }
      }
    });
    return largestLevel;
  };


  var resize = function() {
    if (Misc.resize(canvas)) {
      var level = chooseLevel(globals.levels, canvas.clientWidth, canvas.clientHeight);
      if (level !== globals.chosenLevel) {
        window.location.reload();
      }
    }
  };
  g_services.globals = globals;

  if (globals.tileInspector) {
    var element = document.createElement("div");
    var s = element.style;
    s.zIndex = 20000;
    s.position = "absolute";
    s.backgroundColor = "rgba(0,0,0,0.6)";
    s.padding = "1em";
    s.color = "white";
    s.pointerEvents = "none";
    document.body.appendChild(element);
    $("outer").addEventListener('mousemove', function(e) {
      var pos = Input.getRelativeCoordinates(e.target, e);
      var level = g_levelManager.getLevel();
      var offset = level.getTransformOffset(levelCtx);
      var x = pos.x - offset.x;
      var y = pos.y - offset.y;
      var tileId = level.getTileByPixel(x, y);
      var tileInfo = g_levelManager.getTileInfo(tileId);
      var px = (canvas.clientLeft + pos.x) + "px";
      var py = (canvas.clientTop  + pos.y) + "px";
      s.left = px;
      s.top  = py;
      element.innerHTML = "<pre>" +
        "x: " + x + "\n" +
        "y: " + y + "\n" +
        "tileId:" + tileId + " (" + String.fromCharCode(tileId) + ")";
    }, false);
  };

  var createTexture = function(img) {
    var tex = Textures.loadTexture(img);
    tex.setParameter(gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    tex.setParameter(gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    tex.setParameter(gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    tex.setParameter(gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };

  g_services.createTexture = createTexture;
  // colorize: number of colors to make
  // slizes: number = width of all slices, array = width of each consecutive slice
  var images = {
    idle:  { url: "assets/spr_idle.png",  colorize: 32, scale: 2, slices: 16, },
    move:  { url: "assets/spr_run.png",   colorize: 32, scale: 2, slices: 16, },
    jump:  { url: "assets/spr_jump.png",  colorize: 32, scale: 2, slices: [16, 17, 17, 18, 16, 16] },
//    brick: { url: "assets/bricks.png",    colorize:  1, scale: 2, slices: 48, },
    coin:  { url: "assets/coin_anim.png", colorize:  1, scale: 4, slices: 8, },
  };
  var colors = [];
  g_services.images = images;
  g_services.colors = colors;
  var processImages = function() {
    // make 32 colors of duck. Maybe we should do this in WebGL and use a shader!?
    var duckBlueRange = [180 / 360, 275 / 360];
    Object.keys(images).forEach(function(name) {
      var image = images[name];
      image.colors = [];
      image.imgColors = [];
      for (var ii = 0; ii < image.colorize; ++ii) {
        var h = ii / 32;
        var s = (ii % 2) * -0.6;
        var v = (ii % 2) * 0.1;
        var range = duckBlueRange;
        colors.push({
          id: ii,
          h: h,
          s: s,
          v: v,
          range: range,
        });
        var coloredImage = ii ? ImageUtils.adjustHSV(image.img, h, s, v, range) : image.img;
        var numFrames = image.slices.length ? image.slices.length : image.img.width / image.slices;
        var frames = [];
        var imgFrames = [];
        var x = 0;
        for (var jj = 0; jj < numFrames; ++jj) {
          var width = image.slices.length ? image.slices[jj] : image.slices;
          var frame = ImageUtils.cropImage(coloredImage, x, 0, width, coloredImage.height);
          frame = ImageUtils.scaleImage(frame, width * image.scale, frame.height * image.scale);
          imgFrames.push(frame);
          frame = createTexture(frame);
          frames.push(frame);
          x += width;
        }
        image.colors[ii] = frames;
        image.imgColors[ii] = imgFrames;
      }
    });

    var realImageMappings = {
      "assets/tilesets/bricks.png": "assets/tilesets/bricks-real.png",
    };
    var loaderOptions = {
      imageMappings: globals.debug ? {} : realImageMappings,
    };
    globals.chosenLevel = chooseLevel(globals.levels, canvas.clientWidth, canvas.clientHeight);
    LevelLoader.load(gl, globals.chosenLevel.url, loaderOptions, function(err, level) {
      if (err) {
        throw err;
      }
      level.layers = level.layers.map(function(layer) {
        return new Level(layer);
      });
      globals.level = level;

      // Figure out which level is the play one.
      var playLevel;
      globals.level.layers.forEach(function(layer) {
        if (layer.name == "Tile Layer 1" ||
            Strings.startsWith(layer.name.toLowerCase(), "play")) {
          playLevel = layer;
        }
      });
      if (!playLevel) {
        playLevel = globals.level.layers[globals.level.layers.length / 2 | 0];
      }
      globals.playLevel = playLevel;

      startGame();
    });

    var resetGame = function() {
      g_services.levelManager.reset(canvas.width, canvas.height, globals.playLevel);
      g_services.playerManager.forEachPlayer(function(player) {
        player.reset();
      });
      if (globals.coin) {
        globals.coin.reset();
      }
    };

    function startGame() {
      var g_levelManager = new LevelManager(g_services);
      g_services.levelManager = g_levelManager;

      resetGame();
      resize();

      // Add a 2 players if there is no communication
      if (!globals.haveServer) {
        startLocalPlayers();
      }

      g_services.particleEffectManager = new ParticleEffectManager(g_services);
      globals.coin = new Collectable(g_services);

      var server;
      if (globals.haveServer) {
        var server = new GameServer();
        g_services.server = server;
        server.addEventListener('playerconnect', g_playerManager.startPlayer.bind(g_playerManager));
      }
      GameSupport.init(server, globals);
      GameSupport.run(globals, mainloop);
    }
  };

  ImageLoader.loadImages(images, processImages);

  var mainloop = function() {
    resize();
    g_services.levelManager.getDrawOffset(globals.drawOffset);
    g_services.entitySystem.processEntities();

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.15, 0.15, 0.15, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    var level = g_services.levelManager.getLevel();
    var xtraX = ((gl.canvas.width  - level.levelWidth ) / 2 | 0);
    var xtraY = ((gl.canvas.height - level.levelHeight) / 2 | 0);
    gl.scissor(xtraX, xtraY, level.levelWidth, level.levelHeight);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(
        globals.level.backgroundColor[0],
        globals.level.backgroundColor[1],
        globals.level.backgroundColor[2],
        globals.level.backgroundColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);


    var layerNdx = 0;
    var layers    = globals.level.layers;
    var numLayers = layers.length;
    if (globals.playLevel) {
      // Draw all layers before and including playLevel
      for (; layerNdx < numLayers && layer !== globals.playLevel; ++layerNdx) {
        var layer = layers[layerNdx];
        if (layer === globals.playLevel) {
          g_services.particleSystemManager.drawParticleSystemBehindLevel(globals.drawOffset);
          gl.disable(gl.BLEND);
        }
        layer.draw(g_services.levelManager, globals);
      }
    }
    g_services.particleSystemManager.drawParticleSystemBehindPlayer(globals.drawOffset);
    g_services.drawSystem.processEntities();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);
    g_services.spriteManager.draw();
    gl.disable(gl.BLEND);

    if (globals.playLevel) {
      // Draw the remaining layers
      for(; layerNdx < numLayers; ++layerNdx) {
        var layer = layers[layerNdx];
        layer.draw(g_services.levelManager, globals);
      }
    }
    g_services.particleSystemManager.drawParticleSystemInFrontOfPlayer(globals.drawOffset);


    g_services.scoreManager.update();
  };

  var sounds = {
    coin:              { jsfx: ["square",0.0000,0.4000,0.0000,0.0240,0.4080,0.3480,20.0000,909.0000,2400.0000,0.0000,0.0000,0.0000,0.0100,0.0003,0.0000,0.2540,0.1090,0.0000,0.0000,0.0000,0.0000,0.0000,1.0000,0.0000,0.0000,0.0000,0.0000], },
    jump:              { jsfx: ["square",0.0000,0.4000,0.0000,0.1800,0.0000,0.2040,20.0000,476.0000,2400.0000,0.3360,0.0000,0.0000,0.0100,0.0003,0.0000,0.0000,0.0000,0.5000,0.0000,0.0000,0.0000,0.0000,1.0000,0.0000,0.0000,0.0000,0.0000], },
    coinland:          { jsfx: ["square",0.0000,0.4000,0.0000,0.0520,0.3870,0.1160,20.0000,1050.0000,2400.0000,0.0000,0.0000,0.0000,0.0100,0.0003,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,1.0000,0.0000,0.0000,0.0000,0.0000], },
    bonkhead:          { jsfx: ["square",0.0000,0.4000,0.0000,0.0120,0.4500,0.1140,20.0000,1218.0000,2400.0000,0.0000,0.0000,0.0000,0.0100,0.0003,0.0000,0.5140,0.2350,0.0000,0.0000,0.0000,0.0000,0.0000,1.0000,0.0000,0.0000,0.0000,0.0000], },
    land:              { jsfx: ["sine",0.0000,0.4000,0.0000,0.1960,0.0000,0.1740,20.0000,1012.0000,2400.0000,-0.7340,0.0000,0.0000,0.0100,0.0003,0.0000,0.0000,0.0000,0.3780,0.0960,0.0000,0.0000,0.0000,1.0000,0.0000,0.0000,0.0000,0.0000] , },
  };
  var audioManager = new AudioManager(sounds);
  g_services.audioManager = audioManager;
});


