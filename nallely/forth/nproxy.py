from nallely.core import VirtualDevice


class NProxy:
    def __init__(self, addr, obj):
        self.addr = addr
        self.obj = obj

    @classmethod
    def of(cls, component, uid):
        match component:
            case VirtualDevice():
                return NVirtDev(uid, component)

    def generate_vocab(self):
        raise NotImplementedError(f"No vocab for {self.obj}")


class NMidiDev(NProxy): ...


class NVirtDev(NProxy):
    def generate_vocab(self):
        NL = "\n"
        # _wrap is temporary, until I implement strings
        return f"""
: {self.obj.uid()}@ {self.obj.uuid} nread ;
: {self.obj.uid()}! {self.obj.uuid} nwrite ;
: nallely_port
    :
    ['] lit ,
    latest @ NFA ,
    ['] @ ,
    ['] exit ,
    0 state !
;
: nallely_port_read
    :
    ['] lit ,
    latest @ NFA ,
    ['] @ ,
    ['] lit ,
    {self.obj.uuid} ,
    ['] nread ,
    ['] exit ,
    0 state !
;
: nallely_port_write
    :
    ['] lit ,
    latest @ NFA ,
    ['] @ ,
    ['] lit ,
    {self.obj.uuid} ,
    ['] nwrite ,
    ['] exit ,
    0 state !
;
{NL.join(self.generate_port_vocab())}
"""

    def generate_port_vocab(self):
        for port in self.obj.all_parameters():
            yield f"nallely_port {port.name} ; "
            yield f"nallely_port_read {self.obj.uid()}/{port.name}@ ; "
            yield f"nallely_port_write {self.obj.uid()}/{port.name}! ; "

    def nread(self, port):
        if "/" in port:
            _, port = port.split("/")
            port = port[:-1]
        return float(getattr(self.obj, port.lower()))

    def nwrite(self, port, value):
        if "/" in port:
            _, port = port.split("/")
            port = port[:-1]
        self.obj.set_parameter(port.lower(), value)


class NMidiSection(NProxy): ...


class NVirtParameter(NProxy): ...


class NKeys(NProxy): ...


class NMidiParameter(NProxy): ...


class NMidiPitchwheel(NProxy): ...


class NLink(NProxy): ...


class NScaler(NProxy): ...
