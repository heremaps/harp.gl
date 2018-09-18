import * as React from "react";

import { MapView } from "@here/mapview-react-native-web";
import { AppRegistry, Button, Picker, Platform, Text, View } from "react-native";

import { LocationOption } from "@here/map";
import { bearerTokenProvider } from "./common";

export interface AppState {
    location: LocationOption;
    theme: string;
}

const locations: { [name: string]: LocationOption } = {
    "Berlin": [52.518611, 13.376111],
    "Potsdam": [52.4, 13.066667],
    "Warsaw": [52.232222, 21.008333],
    "Paris": [48.8772927, 2.2898895],
    "New York": [40.6871273, -74.0230586],
};

export class ReactNativeWebMapExample extends React.Component<{}, AppState> {
    constructor(props: {}) {
        super(props);
        this.state = {
            location: locations.Berlin,
            theme: "resources/day.json"
        };
    }
    render() {
        return (
            <View style={{ flexDirection: "column", height: "100%" }}>
                <View
                    style={{ height: 60, backgroundColor: "#48dad0", padding: 20 }}
                >
                    <Text>Welcome to React Native Web with Map!</Text>
                </View>
                <View
                    style={{
                        flexDirection: "row",
                        height: 60,
                        flexGrow: 0,
                        justifyContent: "space-around"
                    }}
                >
                    {Object.keys(locations).map(locationKey => (
                        <Button
                            key={locationKey}
                            title={locationKey}
                            onPress={() => this.setState({ location: locations[locationKey] })}
                        />
                    ))}

                    <Picker
                        selectedValue={this.state.theme}
                        // tslint:disable-next-line:no-unused-variable
                        onValueChange={(itemValue, itemIndex) =>
                            this.setState({ theme: itemValue })
                        }
                    >
                        <Picker.Item label="Day" value="resources/day.json" />
                        <Picker.Item label="ReducedDay" value="resources/reducedDay.json" />
                        <Picker.Item label="Night" value="resources/theme.json" />
                    </Picker>
                </View>
                <MapView
                    style={{
                        flex: 1,
                        flexGrow: 1
                    }}
                    themeUrl={this.state.theme}
                    decoderUrl="decoder.bundle.js"
                    location={this.state.location}
                    authenticationCode={bearerTokenProvider}
                />
            </View>
        );
    }
}

//
// react-native-web needs this to be full-screen
//   -> https://github.com/necolas/react-native-web/issues/528
//
document.write(`
    <style>
        html, body, #app {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }
    </style>
`);

const APP_NAME = "verity_react";

// register the app
AppRegistry.registerComponent(APP_NAME, () => ReactNativeWebMapExample);
if (Platform.OS === "web") {
    AppRegistry.runApplication(APP_NAME, {
        rootTag: document.getElementById("app")
    });
}
