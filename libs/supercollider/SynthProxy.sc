SynthProxy {
    var <synth, <>routes, <server, <name;

    *new { |defName, args|
        ^super.new.init(defName, args);
    }

    init { |defName, args|
        synth = Synth(defName, args);
        routes = OrderedIdentitySet.new;
    }

    doesNotUnderstand { |selector ... args|
        if(selector == \set) {
            "Sending %/% %".format(name, args[0], args[1]).postln;
            server.sendMsg("/%/%".format(name, args[0]), args[1]);
            synth.performList(\set, args);
            ^ this;
        }
        ^synth.performList(selector, args);
    }

    registerInNallely { |srv synthName |
        var desc, list;
        if(routes.isEmpty.not) {
            ^ this;
        };
        desc = SynthDescLib.global.at(synth.defName.asSymbol);
        list = desc.controls.collect { |ctrl|
            (name: ctrl.name, range: [0, 127])
        };
        name = synthName;
        server = srv;
        "Sending /%/autoconfig".format(name).postln;
        server.sendMsg("/%/autoconfig".format(name), (
            \parameters: list,
            \callback_port: NetAddr.langPort
        ).asJSON);
        "Registering parameters: %".format(list).postln;
        list.do { |v|
            var path = "/%/%".format(name, v.name).asSymbol;
            var key = "_%_%".format(name, v.name).asSymbol;
            "Registering %".format(path).postln;
            routes.add(
                OSCdef(key, { |msg|
                    var val = msg[1];
                    synth.set(v.name.asSymbol, val);
                }, path);
            );
        };
        routes.add(
            OSCdef("_%_unregister".format(name).asSymbol, { |msg|
                "Unregistering %".format(name).postln;
                routes.do { | route |
                    "Unregistering %".format(route).postln;
                    route.free;
                };
                routes.clear;
            }, "/%/unregister".format(name).asSymbol)
        );
    }

    unregisterFromNallely {
        routes.do { | route |
            "Unregistering %".format(route).postln;
            route.free;
        };
        routes.clear;
        server.sendMsg("/%/unregister".format(name), 0);
    }
}
