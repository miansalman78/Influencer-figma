import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const TestApp = () => {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Test App - If you see this, the bundler works!</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    text: {
        fontSize: 18,
        color: '#000',
    },
});

export default TestApp;
