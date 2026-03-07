SynthProxy {
    var <synth, <>routes, <server;

    *new { |defName, args|
        ^super.new.init(defName, args);
    }

    init { |defName, args|
        synth = Synth(defName, args);
        routes = Array.new;
    }

    doesNotUnderstand { |selector ... args|
        if(selector == \set) {
            server.sendMsg("/BB/" ++ args[0], args[1]);
            synth.performList(\set, args);
            ^ this;
        }
        ^synth.performList(selector, args);
    }

    registerInNallely { |srv|
        var desc = SynthDescLib.global.at(synth.defName.asSymbol);
        var list = desc.controls.collect { |ctrl|
            (name: ctrl.name, range: [0, 127])
        };
        server = srv;
        server.sendMsg("/BB/autoconfig", (
            \parameters: list,
            \callback_port: NetAddr.langPort
        ).asJSON);
        "Registering parameters: %".format(list).postln;
        list.do { |v|
            var path = ("/BB/" ++ v.name).asSymbol;
            routes.add(
                OSCdef(v.name.asSymbol, { |msg|
                    var val = msg[1];
                    synth.set(v.name.asSymbol, val);
                }, path)
            );
        };
    }
}

