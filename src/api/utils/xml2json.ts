export default function xml2json (srcDom: any, attributeValue = true): {[key: string]: any} {
    // HTMLCollection to Array
    const children = [...srcDom.children]
    const jsonResult: any = {}

    // base case for recursion
    if (!children.length) {
        if (attributeValue) {
            if (srcDom.hasAttributes()) {
                return {
                    getValue: () => srcDom.textContent,
                    getAttributes: () => parseNodeAttributes(srcDom.attributes)
                };
            }
            return {
                getValue: () => srcDom.textContent,
                getAttributes: () => undefined
            };
        }
        return srcDom.textContent;
    }

    // in the first iteration it is a (XML-)Document
    if (srcDom instanceof global.Node && (srcDom as Element).hasAttributes?.()) {
        jsonResult.attributes = parseNodeAttributes((srcDom as Element).attributes);
    }

    children.forEach(child => {
        // checking if child has siblings of same name
        const childIsArray = children.filter(eachChild => eachChild.nodeName === child.nodeName).length > 1;
        // the key is equal to the nodeName property without the xmlns if exists
        const keyName = child.nodeName.substring(child.nodeName.indexOf(":") + 1);

        // if child is array, save the values as an array of objects, else as object
        if (childIsArray) {
            if (jsonResult[keyName] === undefined) {
                jsonResult[keyName] = [xml2json(child, attributeValue)];
            }
            else {
                jsonResult[keyName].push(xml2json(child, attributeValue));
            }
        }
        else {
            jsonResult[keyName] = xml2json(child, attributeValue);
        }
    });

    return jsonResult;
}

/**
 * Gets the names and the values from the attributes of a node
 * @param {Object} nodeAttributes - collection of nodes attributes as a NamedNodeMap object
 * @returns {Object} name value pairs
 */
function parseNodeAttributes (nodeAttributes) {
    const attributes = {};

    for (const node of nodeAttributes) {
        attributes[node.name] = node.value;
    }

    return attributes;
}
