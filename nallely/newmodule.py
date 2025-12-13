def create_class(name):
    from nallely import VirtualDevice

    doc = f"""    \"\"\"
    {name}

    inputs:
    # * %inname [%range] %options: %doc

    outputs:
    # * %outname [%range]: %doc

    type: <ondemand | continuous>
    category: <category>
    # meta: disable default output
    \"\"\"
    """
    cls = type(
        name,
        (VirtualDevice,),
        {
            "__doc__": doc,
        },
    )
    code = f"""class {name}(VirtualDevice):
{doc}
    """
    cls.__source__ = code
    return cls
