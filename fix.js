const fs = require('fs'); const file = 'app/(tabs)/explore.tsx'; const content = fs.readFileSync(file, 'utf8'); const lastModal = content.lastIndexOf('</Modal>'); const fixed = content.substring(0, lastModal + 8) + '

      {/* Personal Info Modal */}
      <PersonalInfoModal />
    </View>
  );
};

export default HomeScreen;'; fs.writeFileSync(file, fixed); console.log('File fixed');
